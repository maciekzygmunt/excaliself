---
title: Hostinger
description: Deploy on a Hostinger VPS with Docker Manager, from the repository's compose file.
---

## Deploy with the button

[![Deploy on Hostinger](https://assets.hostinger.com/vps/deploy.svg)](https://www.hostinger.com/docker-hosting?compose_url=https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml)

The button opens Hostinger's Docker hosting with Excaliself's
`docker-compose.yaml`: the app and its Postgres database. On a VPS you already
have, open **Docker Manager**, choose **Compose from URL**, and paste:

```
https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml
```

Before you deploy, set these in the project's environment:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | The output of `openssl rand -hex 24` |
| `BETTER_AUTH_SECRET` | The output of `openssl rand -base64 32` |
| `BASE_URL` | The address you open the app at, e.g. `http://<VPS IP>:3000` |

The project does not start without the first two. Sign-in refuses any address
other than `BASE_URL`, unless you list it in
[`TRUSTED_ORIGINS`](/docs/environment/#more-than-one-address). When the deploy
finishes, open `BASE_URL` to create the admin account. The first visitor becomes the admin, so do this right away.

## HTTPS

The app listens on port `3000` over plain HTTP. For anything public, point a
domain at the VPS, put a reverse proxy with HTTPS in front of the app, and set
`BASE_URL` to the `https://` address. See
[Reverse proxy](/docs/docker-compose/#reverse-proxy).

## Upgrade or pin a version

Drawings live in the `pgdata` volume and survive redeploys. Upgrades work as
in [Docker Compose](/docs/docker-compose/#upgrade-or-pin-a-version): pull the
newer image and restart. To pin a release, set `EXCALISELF_VERSION` (e.g.
`1.2.3`) in the project's environment. The other settings, such as
[single sign-on](/docs/single-sign-on/), are in
[Environment variables](/docs/environment/).
