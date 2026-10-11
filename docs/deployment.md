# Deployment

Excaliself ships as a prebuilt multi-arch (amd64, arm64) image:

```
ghcr.io/maciekzygmunt/selfhosted-excalidraw
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
curl -fsSLO https://raw.githubusercontent.com/maciekzygmunt/selfhosted-excalidraw/main/docker-compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/maciekzygmunt/selfhosted-excalidraw/main/.env.example
# fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET and BASE_URL in .env
docker compose up -d
```

Open `BASE_URL`. The first visit goes to `/setup`, where you create the admin
account. After that, sign-up is invite-only.

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
docker compose -f docker-compose.build.yaml up -d --build
```

## Coolify

1. In your project, add a new resource: **Public Repository**, URL
   `https://github.com/maciekzygmunt/selfhosted-excalidraw`, branch `main`.
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

## Local development

```bash
cp .env.dev.example .env
docker compose -f docker-compose.dev.yaml up -d   # Postgres on 127.0.0.1:5432
pnpm install
pnpm dev
```
