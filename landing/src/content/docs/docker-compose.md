---
title: Docker Compose
description: Run the prebuilt image behind a reverse proxy, pin a version, and upgrade.
---

Excaliself ships as a prebuilt multi-arch (amd64, arm64) image, on GitHub
Container Registry and on
[Docker Hub](https://hub.docker.com/r/maciekzygmunt/excaliself):

```
ghcr.io/maciekzygmunt/excaliself
maciekzygmunt/excaliself
```

Both have the same tags. The compose files use the GHCR one. To pull from
Docker Hub, change the `image:` line in `docker-compose.yaml` to
`maciekzygmunt/excaliself:${EXCALISELF_VERSION:-latest}`.

| Tag | Tracks |
|---|---|
| `latest` | Newest release |
| `1.2.3` | That exact release |
| `1.2` | Newest `1.2.x` patch |
| `main` | Tip of `main` (unreleased, may break) |

The app needs PostgreSQL. `docker-compose.yaml` starts both. The app runs
database migrations on startup, so upgrading is pulling a newer image and
restarting. `GET /api/health` returns 200 when the app is serving and Postgres
is reachable; the image uses it as its container healthcheck.

See the [Quick start](/docs/) for the install commands and
[Environment variables](/docs/environment/) for every setting.

## Run one app container

Run exactly one app container (one replica, one process). The app keeps each
live drawing's collaboration room in its own memory. Do not scale the app
service or put several replicas behind a load balancer: people on different
replicas would not see each other's edits, and the replicas' saves would
overwrite each other.

## Reverse proxy

Postgres is not published on the host; only the app port is
(`EXCALISELF_PORT`, default `3000`). On a public server, put a reverse proxy
with TLS (Caddy, Traefik, nginx) in front of it and set `BASE_URL` to the
public `https://` URL. Auth rejects sign-ins from any other origin, unless you
list it in [`TRUSTED_ORIGINS`](/docs/environment/#more-than-one-address). Set
`EXCALISELF_PORT=127.0.0.1:3000` to keep the app port local to the proxy.

Rate limits, sign-in included, count per client IP address. The app trusts
`X-Forwarded-For` only from a proxy on a private address (such as `127.0.0.1`
or a Docker network). If your proxy connects from a public address, all its
clients count as one.

Live collaboration and all Team drawings use WebSockets on the app port, under
`/ws/`, so the proxy must pass them through. Caddy and Traefik do this by default:

```
draw.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx needs the upgrade headers. Its default 1 MB body limit is also too small
for images. The app itself refuses request bodies over 64 MB:

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

## Upgrade or pin a version

```bash
# optional: pin in .env, e.g. EXCALISELF_VERSION=1.2.3
docker compose pull
docker compose up -d
```

Drawings live in the `pgdata` volume, which survives upgrades and
`docker compose down`. `docker compose down -v` deletes it.

Take a [backup](/docs/backup-restore/) before each upgrade. There are no down
migrations, so restoring it is the safe way back to the older version.

## Portainer

In Portainer, add a stack from **Repository** with the URL
`https://github.com/maciekzygmunt/excaliself` and the compose path
`docker-compose.portainer.yaml`. Add `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`,
and `BASE_URL` as environment variables, then deploy. Set `BASE_URL` to the
address you open the app at, e.g. `http://192.168.1.10:3000`. The stack does
not start without it. The repository's `portainer-template.json` is the same
stack as a Portainer app template.

## Build from source

To build the image on the server instead of pulling it (needs ~4 GB RAM),
clone the repo and run:

```bash
docker compose -f docker-compose.yaml -f docker-compose.build.yaml up -d --build
```

`docker-compose.build.yaml` alone publishes no port; `docker-compose.yaml` adds
it.
