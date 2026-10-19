# Public demo

A public instance where anyone can try Excaliself, for example
`https://demo.excaliself.com`. It is the normal app with `DEMO_MODE=true`, a
stricter variant of [preview mode](./pr-previews.md):

- The database is an in-memory PGlite. It never connects to `DATABASE_URL`.
  Data is lost when the container restarts.
- `/demo` signs the visitor in to a new member account with its own copy of
  the example folders and drawings. A visitor who is already signed in keeps
  their account. Link to `/demo` from the landing page.
- A job deletes demo accounts and all their drawings `DEMO_RETENTION_HOURS`
  after sign-up (default 6). A nightly restart (below) clears everything.
- The instance has an admin that nobody can sign in as, so `/setup` stays
  closed. `/preview/login` returns 404.

All visitors are members of one instance, so the demo refuses what would let
them reach each other's work, or what would make no sense on a throwaway
account. The server enforces each rule; the UI only hides what it refuses.

| Refused | How |
|---|---|
| Team space | The database refuses Team rows. The UI hides Team |
| "Anyone" Share links | The database refuses them. Members links work, so two visitors can still draw together |
| Admin pages, invites and password resets | The admin middleware refuses everyone |
| Changing email or password, deleting the account | The server functions and the better-auth endpoints refuse them |
| More than 50 drawings or 50 folders per account | Checked when one is made |
| Scenes over 1 MB, images over 4 MB per drawing | Checked on save and upload |
| More than 10 new accounts per IP address per hour | `/demo` returns 429 |

## Coolify setup

The demo is its own Coolify resource, separate from production. It needs no
Postgres, so it runs the prebuilt image.

1. **New resource.** Add a **Docker Image** resource with the image
   `ghcr.io/maciekzygmunt/excaliself:main`. Use a release tag instead if
   the demo must not change with each push to `main`.
2. **Domain.** Set the domain, for example `https://demo.excaliself.com`,
   with port `3000`. Add a DNS record that points it to the server.
3. **Environment Variables:**

   | Variable | Value |
   |---|---|
   | `DEMO_MODE` | `true` |
   | `PREVIEW_HOSTS` | The demo's host, for example `demo.excaliself.com`. Auth refuses other hosts |
   | `BETTER_AUTH_SECRET` | A new random value (`openssl rand -base64 32`). The demo is public, so it has no default |
   | `DEMO_RETENTION_HOURS` | Optional. Hours before a demo account is deleted (default `6`) |

   Do not set `DATABASE_URL`. The demo ignores it.
4. **Deploy.** Then open `https://demo.excaliself.com/demo`.

### Nightly restart

The cleanup job deletes old accounts, but a restart is a second safety net:
it frees all memory and starts from an empty database. Add a cron job on the
Coolify server, as root (`crontab -e`):

```cron
0 4 * * * docker ps -q --filter name=<resource uuid> | xargs -r docker restart
```

The resource uuid is in the resource's URL in Coolify. Visitors who are
signed in at 04:00 lose their session and their drawings.

## Things to know

- **Memory.** Everything lives in the container's memory. The limits above
  keep one account small, but many accounts still add up. Set a memory
  limit on the resource, so a full demo cannot take memory from other apps.
  When the container hits it, Docker restarts it with an empty database.
- **Rooms of deleted accounts.** If a visitor is deleted while a shared
  drawing is open, the room stays open until everyone leaves, but nothing
  is saved.
- **Locally:** `pnpm dev:demo` runs demo mode with no Postgres and no `.env`.
  Open `/demo`.
