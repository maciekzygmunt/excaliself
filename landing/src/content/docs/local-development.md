---
title: Local development
description: Run the app from source. Requires Node 22, pnpm, and Docker.
---

## Start the app

```bash
pnpm install
cp .env.dev.example .env                           # works as-is
docker compose -f docker-compose.dev.yaml up -d    # Postgres on 127.0.0.1:5432
pnpm dev                                           # http://localhost:3000
```

`pnpm dev:preview` needs no Postgres and no `.env`: it runs in
[preview mode](/docs/environment/#previews). Open `/preview/login`.

## Checks and migrations

`pnpm test`, `pnpm typecheck`, and `pnpm lint` run the checks.
`pnpm db:generate` creates a migration after a schema change.

Releases are cut from git tags; see
[docs/releasing.md](https://github.com/maciekzygmunt/excaliself/blob/main/docs/releasing.md).
