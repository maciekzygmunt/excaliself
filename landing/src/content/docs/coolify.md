---
title: Coolify
description: Deploy from the public repository. Coolify creates the database, the secrets, and a domain.
---

## Deploy

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
network. Drawings live in the `pgdata` volume and survive redeploys.

## Pin a version

Set `EXCALISELF_VERSION` in the resource's environment variables and redeploy.

## Deploy every push to main

Coolify's auto-deploy fires on push, before CI publishes the new image. To
run the pushed commit, build it on the server instead: set **Docker Compose
Location** to `/docker-compose.build.yaml` and keep **Auto Deploy** on. Set
`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and `BASE_URL` in the resource's
environment variables (see [Environment variables](/docs/environment/)). The
build needs ~4 GB of RAM. The file publishes no host port, so it does not
conflict with other apps on port 3000.

To also deploy each pull request to its own throwaway instance, see
[PR previews](https://github.com/maciekzygmunt/excaliself/blob/main/docs/pr-previews.md).
