---
title: Railway
description: Run the prebuilt image next to a Railway Postgres database.
---

## Deploy

1. In a new Railway project, add a **PostgreSQL** database.
2. Add a service from the Docker image `ghcr.io/maciekzygmunt/excaliself:latest`.
3. In the service's **Settings → Networking**, generate a domain with port
   `3000`.
4. In the service's **Variables**, set:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `BETTER_AUTH_SECRET` | The output of `openssl rand -base64 32` |
   | `BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
   | `PORT` | `3000` |

5. Deploy, and open the domain to create the admin account.

`DATABASE_URL` points at Postgres over Railway's private network, so the
database needs no public access. Drawings live in the database's volume and
survive redeploys. The other settings, such as
[single sign-on](/docs/single-sign-on/), are in
[Environment variables](/docs/environment/).

## Upgrade or pin a version

Railway does not pull a newer image on its own. To upgrade, redeploy the
service, or turn on automatic updates in its settings. To pin a version, use a
release tag in the image name, e.g.
`ghcr.io/maciekzygmunt/excaliself:1.2.3`.
