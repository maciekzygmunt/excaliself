# Deployment

Excaliself ships as a prebuilt multi-arch (amd64, arm64) image:

```
ghcr.io/maciekzygmunt/excaliself
```

| Tag | Tracks |
|---|---|
| `latest` | Newest release |
| `1.2.3` | That exact release |
| `1.2` | Newest `1.2.x` patch |
| `main` | Tip of `main` (unreleased, may break) |

The app needs PostgreSQL. It runs database migrations on startup, so
upgrading is pulling a newer image and restarting. `GET /api/health` returns
200 when the app is serving and Postgres is reachable; the image uses it as
its container healthcheck.

## Docker Compose

```bash
mkdir excaliself && cd excaliself
curl -fsSLO https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/.env.example
# fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET and BASE_URL in .env
docker compose up -d
```

Open `BASE_URL`. The first visit goes to `/setup`, where you create the admin
account. After that, people join by invite link or with
[single sign-on](#single-sign-on).

Postgres is not published on the host; only the app port is
(`EXCALISELF_PORT`, default `3000`). On a public server, put a reverse proxy
with TLS (Caddy, Traefik, nginx) in front of it and set `BASE_URL` to the
public `https://` URL. Auth rejects sign-ins from any other origin.

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | — | Database password. Use hex (`openssl rand -hex 24`): it goes into a connection URL |
| `BETTER_AUTH_SECRET` | Yes | — | Auth signing secret, min 32 chars (`openssl rand -base64 32`) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL users open in the browser |
| `EXCALISELF_VERSION` | No | `latest` | Image tag to run, see above |
| `EXCALISELF_PORT` | No | `3000` | Host port for the app. `127.0.0.1:3000` keeps it local to a reverse proxy |
| `POSTGRES_USER` | No | `excaliself` | Database user |
| `POSTGRES_DB` | No | `excaliself` | Database name |

### Upgrade or pin a version

```bash
# optional: pin in .env, e.g. EXCALISELF_VERSION=1.2.3
docker compose pull
docker compose up -d
```

Drawings live in the `pgdata` volume, which survives upgrades and
`docker compose down`. `docker compose down -v` deletes it.

### Build from source

To build the image on the server instead of pulling it (needs ~4 GB RAM),
clone the repo and run:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up -d --build
```

`docker-compose.build.yaml` alone publishes no port; `docker-compose.yaml` adds
it.

## Coolify

1. In your project, add a new resource: **Public Repository**, URL
   `https://github.com/maciekzygmunt/excaliself`, branch `main`.
2. Set **Build Pack** to **Docker Compose** and **Docker Compose Location** to
   `/docker-compose.coolify.yaml`.
3. Deploy.

Coolify generates the Postgres password and auth secret, and passes the
service's domain to the app as `BASE_URL`. If your server has no wildcard
domain, set a domain on the `excaliself` service first, with the container
port: `https://draw.example.com:3000`. After deploy, check under
**Environment Variables** that `BASE_URL` is the public URL users open.

Only Coolify's proxy can reach the app; Postgres stays on the internal
network. To pin a version, set `EXCALISELF_VERSION` in the resource's
environment variables and redeploy.

### Deploy every push to main

Coolify's auto-deploy fires on push, before CI publishes the new image. To
run the pushed commit, build it on the server instead: set **Docker Compose
Location** to `/docker-compose.build.yaml` and keep **Auto Deploy** on. Set
`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and `BASE_URL` in the resource's
environment variables (see the table above). The build needs ~4 GB of RAM.
The file publishes no host port, so it does not conflict with other apps on
port 3000.

To also deploy each pull request to its own throwaway instance, see
[PR previews](./pr-previews.md).

## Single sign-on

Members can sign in with Google Workspace, Microsoft Entra ID, or one OIDC
provider (Okta, Authentik, Keycloak, Zitadel, Pocket ID and others). Each
provider you configure adds a "Continue with …" button on the sign-in page.
Email and password sign-in and invites keep working.

Who gets in:

- **Existing members** sign in with any provider whose email matches their
  account. The first SSO sign-in links it, removes the account's password,
  signs out its other sessions, and revokes its access tokens: nobody
  verified the email behind that password. An admin can give the password
  back with a reset link.
- **New people** get an account on their first sign-in only if their email
  domain is in `SSO_ALLOWED_DOMAINS`. Everyone else needs an invite link.
  Without `SSO_ALLOWED_DOMAINS`, SSO only signs in existing members.

Each provider limits who can claim a domain:

- **Google:** only Workspace accounts of that domain. A personal Google
  account that uses a work address does not count.
- **Microsoft:** only accounts in the one tenant you set.
- **OIDC:** every account your provider signs in. Limit access to the
  application in your provider.

Deleting a member does not stop them from signing in again with SSO: an
allowed domain recreates the account. Remove them in your provider too.

Set `BASE_URL` to the public URL. Register this redirect URI with the
provider: `<BASE_URL>/api/auth/callback/<id>`, where `<id>` is `google`,
`microsoft`, or `oidc`. Restart the app after a change. PR previews ignore
these settings.

| Variable | Description |
|---|---|
| `SSO_ALLOWED_DOMAINS` | Comma-separated email domains whose people join on their first sign-in, e.g. `acme.com,acme.de` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client of type **Web application** from Google Cloud Console (**APIs & Services → Credentials**) |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | App registration in Microsoft Entra admin center, with a **Web** redirect URI. The tenant ID is the **Directory (tenant) ID**. `common`, `organizations` and `consumers` are refused |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Confidential client in your provider. The issuer is the URL that serves `/.well-known/openid-configuration` |
| `OIDC_NAME` | Button label, e.g. `Okta` (default `SSO`) |

A member who only uses SSO has no password. An admin can give them one with
a password reset link.

## Backup and restore

Everything is in the one Postgres database: accounts, drawings, images, and
share links. One dump backs up the whole instance. Also keep a copy of your
`.env`.

Back up from the directory containing `docker-compose.yaml`:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > excaliself-$(date +%F).dump
```

Restore with the app stopped. This replaces the current data:

```bash
docker compose stop excaliself
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < excaliself-2026-10-13.dump
docker compose start excaliself
```

Restore into the same or a newer version of the app: it migrates the data on
start. An older version cannot read a newer dump, because there are no down
migrations. Take a dump before each upgrade: restoring it is the safe way
back to the older version.

On Coolify, run the same commands against the `db` container from the
server's shell, with `docker exec` and the container name from `docker ps`.

## Local development

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yaml up -d   # Postgres on 127.0.0.1:5432
pnpm install
pnpm dev
```
