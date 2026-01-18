# Excalidraw Self-Hosted

A self-hosted Excalidraw alternative with persistent storage, user accounts, and admin panel.

## Features

- 🎨 Full Excalidraw canvas with auto-save
- 👤 User authentication with invite-only registration
- 👑 Admin panel for user and invite management
- 💾 SQLite database for easy self-hosting
- 🐳 Docker support for simple deployment

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-repo/excalidraw-selfhosted.git
cd excalidraw-selfhosted

# Copy environment file
cp .env.example .env

# Generate a secret key and update .env
# BETTER_AUTH_SECRET should be at least 32 characters

# Run with Docker
docker-compose up -d
```

### Local Development

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

Access at `http://localhost:3000`

## First-Run Setup

1. Visit `http://localhost:3000`
2. You'll be redirected to `/setup` to create the admin account
3. Enter your email, name, and password
4. After setup, you'll be redirected to login
5. Use the admin panel at `/admin` to invite new users

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | - | Secret key for auth (min 32 chars) |
| `BASE_URL` | No | `http://localhost:3000` | Public URL of your instance |
| `DATABASE_PATH` | No | `./data/excalidraw.db` | SQLite database file path |

## Tech Stack

- **Frontend**: TanStack Start + React 19
- **UI**: shadcn/ui + Tailwind CSS
- **Authentication**: Better Auth
- **Database**: SQLite + Drizzle ORM
- **Canvas**: @excalidraw/excalidraw

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Drizzle Studio |

## Architecture

```
src/
├── routes/           # TanStack Router pages
│   ├── index.tsx     # Dashboard
│   ├── login.tsx     # Login page
│   ├── setup.tsx     # First-run setup
│   ├── invite.tsx    # Invite acceptance
│   ├── draw/$id.tsx  # Drawing editor
│   └── admin/        # Admin panel
├── components/       # React components
│   ├── ui/           # shadcn/ui components
│   └── ExcalidrawCanvas.tsx
├── lib/
│   ├── db/           # Database schema & connection
│   ├── auth.ts       # Better Auth config
│   └── auth-client.ts
└── server/           # Server functions
    ├── users.ts
    ├── drawings.ts
    └── invites.ts
```

## License

MIT
