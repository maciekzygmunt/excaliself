# Excaliself

A self-hostable whiteboard app built on top of [Excalidraw](https://excalidraw.com),
with persistent storage, user accounts, and an admin panel.

> Not affiliated with Excalidraw, Inc. "Excalidraw" is a trademark of its
> respective owner; this project uses the open-source `@excalidraw/excalidraw`
> React component.

## Features

- Full Excalidraw canvas with auto-save
- User authentication with invite-only registration
- Admin panel for user and invite management
- PostgreSQL storage with Drizzle migrations
- Docker Compose deployment

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/maciekzygmunt/excaliself.git
cd excaliself
cp .env.example .env
# fill in BETTER_AUTH_SECRET and POSTGRES_PASSWORD (see .env.example)
docker compose up -d
```

Open <http://localhost:3000> and create your admin account at `/setup`.

### Local development

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm dev
```

## First-run setup

1. Visit `http://localhost:3000`
2. You'll be redirected to `/setup` to create the admin account
3. After setup, sign in and visit `/admin` to invite new users

## Admin lockout recovery

Lost passwords are normally recovered with an admin-generated reset link
(Settings → Members). If no admin can sign in — the sole admin lost their
password — follow the
[break-glass recovery recipe](./docs/break-glass-recovery.md).

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | — | Auth signing secret (min 32 chars) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of your instance |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (local dev) |
| `POSTGRES_USER` | No | `excaliself` | Postgres user (Docker Compose) |
| `POSTGRES_PASSWORD` | Yes | — | Postgres password (Docker Compose) |
| `POSTGRES_DB` | No | `excaliself` | Postgres database name (Docker Compose) |
| `POSTGRES_PORT` | No | `5432` | Host port for local dev outside Docker |

## Stack

- **Frontend** — TanStack Start (React 19, file-based router, server functions)
- **UI** — shadcn/ui + Tailwind CSS 4
- **Auth** — Better Auth
- **Database** — PostgreSQL + Drizzle ORM
- **Canvas** — `@excalidraw/excalidraw`

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | Run TypeScript type-check |
| `pnpm lint` | Run Biome linter |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Drizzle Studio |

## Project layout

```
src/
├── routes/           # TanStack file-based router
│   ├── draw/         # Drawing editor
│   └── admin/        # Admin panel
├── features/         # Domain features: drawings, folders, auth, admin
├── components/ui/    # shadcn/ui primitives
├── hooks/            # Shared generic hooks
├── lib/              # Shared utilities
└── db/               # Drizzle client + schema
```

## Status

It's MIT-licensed and self-hostable, but
no contribution support is promised — feel free to fork and adapt.

## License

[MIT](./LICENSE)
