---
title: Environment variables
description: The settings of a deployment. Docker Compose takes them from .env, and Coolify sets the required ones for you.
---

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | — | Database password. Use hex (`openssl rand -hex 24`): it goes into a connection URL |
| `BETTER_AUTH_SECRET` | Yes | — | Auth signing secret, min 32 chars (`openssl rand -base64 32`) |
| `BASE_URL` | In production | `http://localhost:3000` | Public URL users open in the browser. Sign-in refuses pages from any other origin; live collaboration and image uploads refuse pages from any other host. Add more addresses with `TRUSTED_ORIGINS` |
| `TRUSTED_ORIGINS` | No | — | Comma-separated extra origins users may also open, e.g. `http://192.168.1.20:3000,http://nas.local:3000`. See [More than one address](#more-than-one-address) |
| `EXCALISELF_VERSION` | No | `latest` | Image tag to run: `latest`, a release like `1.2.3` or `1.2`, or `main` |
| `EXCALISELF_PORT` | No | `3000` | Host port for the app. `127.0.0.1:3000` keeps it local to a reverse proxy |
| `POSTGRES_USER` | No | `excaliself` | Database user |
| `POSTGRES_DB` | No | `excaliself` | Database name |

`docker-compose.yaml` builds `DATABASE_URL` for the app from the Postgres values.
To use your own Postgres, change `DATABASE_URL` in the compose file.

`GET /api/health` returns `200` when the app is up and can reach Postgres.

### More than one address

A NAS often opens the app at more than one address: a LAN IP, a `.local`
name, and a domain. Set `BASE_URL` to the main one and list the others in
`TRUSTED_ORIGINS`. Each entry is a scheme, host, and port, with no path.

- Sign-in, live collaboration, and image uploads work at every listed origin.
  A sign-in holds only for the address where you signed in.
- Invite and share links use the address you copy them from.
- Single sign-on and MCP sign-in work only at `BASE_URL`, because the
  provider sends you back there.
- If `BASE_URL` is `https://` and an entry is `http://`, sign-in cookies lose
  the `Secure` flag on every address, because browsers drop secure cookies on
  plain HTTP. Members sign in again once after you add it.

## Single sign-on

Optional. Each provider is on when its variables are set. See
[Single sign-on](/docs/single-sign-on/) for the setup and who can join.

| Variable | Description |
|---|---|
| `SSO_ALLOWED_DOMAINS` | Comma-separated email domains whose people join on their first sign-in, e.g. `acme.com,acme.de` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in, for Google Workspace accounts |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Microsoft Entra ID sign-in, for one tenant |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Sign-in with one OIDC provider |
| `OIDC_NAME` | Label of the OIDC button (default `SSO`) |

## Previews

For throwaway instances: a [quick try](/docs/#try-it-first) on your machine, or
[PR previews](https://github.com/maciekzygmunt/excaliself/blob/main/docs/pr-previews.md).

| Variable | Description |
|---|---|
| `PREVIEW_MODE` | `true` runs an in-memory PGlite instead of Postgres, seeded with an admin, example drawings, and a [public MCP token](/docs/mcp/#try-it-in-preview-mode). It ignores `DATABASE_URL` and `BASE_URL` and makes `BETTER_AUTH_SECRET` optional. Data is lost on restart. A preview runs the code of a pull request, so do not give it production secrets |
| `MCP_STDIO` | `true` also serves [MCP over stdio](/docs/mcp/#over-stdio), as the example admin, for clients that start the server themselves. Only with `PREVIEW_MODE=true`: without it, the server does not start |
| `PREVIEW_HOSTS` | Comma-separated hosts a preview answers on, e.g. `*.draw.example.com`. Auth refuses other hosts; localhost always works |
