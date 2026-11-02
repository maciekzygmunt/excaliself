---
title: Self-host Excalidraw with live collaboration
description: Run Excalidraw on your own server with accounts, live collaboration, HTTPS and single sign-on, using Docker Compose and a reverse proxy.
---

The Excalidraw editor is open source, but the hosted app at excalidraw.com
keeps its live-collaboration backend on Excalidraw's servers. Running the
editor yourself gets you the canvas. Live collaboration, saved drawings and
accounts take more pieces. Excaliself bundles them: the Excalidraw editor, a
WebSocket collaboration server in the same app, accounts, and Postgres storage.
This guide takes a fresh Linux server to a working team instance.

For how this differs from wiring the pieces together yourself, see
[Excaliself vs excalidraw-room](/docs/vs-excalidraw-room/).

## What you need

- A server with Docker and the Compose plugin. The prebuilt image runs on
  amd64 and arm64.
- A domain name pointing at the server. Browsers only allow some features,
  including live collaboration, on secure (`https://`) pages, so plan for
  HTTPS.
- Ports 80 and 443 open for the reverse proxy.

## 1. Start the app and database

```bash
mkdir excaliself && cd excaliself
curl -fsSLO https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/.env.example
```

Set three values in `.env`:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BASE_URL` | The public URL, e.g. `https://draw.example.com` |

Also set `EXCALISELF_PORT=127.0.0.1:3000` so the app is reachable only through
the reverse proxy. Then:

```bash
docker compose up -d
```

Postgres is not published on the host. Drawings live in the `pgdata` volume.

## 2. Add a reverse proxy with HTTPS

Live collaboration and Team drawings use WebSockets under `/ws/`, so the proxy
must pass WebSocket upgrades through. With Caddy, which also gets the
certificate for you, this is the whole config:

```
draw.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

With nginx, add the upgrade headers and raise the body limit, which is
otherwise too small for pasted images:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  client_max_body_size 32m;
}
```

`BASE_URL` must match the public URL exactly: sign-ins from any other origin are
rejected. `GET /api/health` returns 200 when the app is up and can reach
Postgres. More detail is in [Docker Compose](/docs/docker-compose/).

## 3. Create the admin account

Open `BASE_URL`. The first visit goes to `/setup`, where you create the admin
account. Everyone else joins by invite link from **Settings**.

## 4. Try live collaboration

Open a drawing, share it by link, and open the link in a second browser or
window. You see each other's cursors and edits in real time, and can follow
another person's view. A link can be limited to members or open to anyone,
including guests without an account. Drawings in the shared
[Team space](/docs/team-space/) are always live. See [Sharing](/docs/sharing/).

## 5. Add single sign-on (optional)

Excaliself supports Google Workspace, Microsoft Entra ID, and any OIDC
provider, including Okta, Authentik and Keycloak. Register
`<BASE_URL>/api/auth/callback/<id>` as the redirect URI (`google`, `microsoft`
or `oidc`), set the provider's variables in `.env`, and add your email domains
to `SSO_ALLOWED_DOMAINS` so people from them join on their first sign-in
without an invite. Restart with `docker compose up -d`. The full list of
variables and the rules about who gets in are in
[Single sign-on](/docs/single-sign-on/).

## 6. Back up and update

Take a [backup](/docs/backup-restore/) before each upgrade, then:

```bash
docker compose pull
docker compose up -d
```

The app applies database migrations on startup. To stay on a release, set
`EXCALISELF_VERSION` in `.env`.

## Other things you can do

- [Connect Claude or another MCP client](/docs/mcp/) so it can find, read and
  create drawings.
- [Import drawings from Excalidraw+](/docs/import/) or from `.excalidraw` files.
- Deploy on [Coolify](/docs/coolify/) instead of plain Compose.

## Is it an open source Miro alternative?

For one job, yes: a shared canvas your team draws on together, hosted by you.
Excaliself is a whiteboard for sketches and diagrams in the Excalidraw style.
It is not a Miro clone. It does not try to cover Miro's templates, sticky-note
workshops, voting, timers or integrations. If you want a self-hosted place to
sketch architecture, flows and wireframes with your team, it fits. If you run
facilitated workshops in Miro, check that you can live without those features
first.
