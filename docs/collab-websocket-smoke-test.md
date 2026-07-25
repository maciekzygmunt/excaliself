# Collab websocket smoke test

The live-collaboration transport is an in-process nitro websocket sharing the
app's port (canvas sharing spec §2.1). It rides on a pinned nitro beta, and
nitro's dev server and its built output wire the HTTP upgrade through
different code paths — so websockets can break in one and not the other.

**Run this after any change to `nitro`, `@tanstack/react-start`, or
`vite.config.ts`'s nitro options, in both `pnpm dev` and the built container.**
That is rollout note 4 of the spec, and the reason this script exists.

## What it checks

`scripts/ws-smoke-test.ts` drives two real websockets against a running
instance:

1. A token that does not exist is refused at upgrade (the connection never opens).
2. A valid token joins, and the server hands back a connection id and the roster.
3. Two peers see each other join, a name sent on `JOIN` reaches the other peer,
   a cursor is relayed to the other peer (and never echoed back to its sender),
   and closing one socket updates the other's roster.
4. The socket past the room's participant cap is closed with the room-full
   code (spec §4.5), and a departure reopens the slot.

## Running it

The script needs a share token. With `DATABASE_URL` set it mints one for the
most recently edited live drawing (audience `anyone`) and deletes the row
afterwards; otherwise pass a token from the Share dialog's link.

```sh
# dev
pnpm dev
pnpm smoke:ws

# the built output — the exact command the container runs
pnpm build
node .output/server/index.mjs
pnpm smoke:ws

# a different host/port, or a token you already have
pnpm smoke:ws --url http://localhost:3000 --token <share-token>
```

### Against the container

```sh
docker build -t excaliself-ws-smoke .
docker run --rm -p 3100:3000 \
  -e DATABASE_URL="postgresql://<user>:<password>@host.docker.internal:5432/<db>" \
  -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  -e BASE_URL=http://localhost:3100 \
  excaliself-ws-smoke

pnpm smoke:ws --url http://localhost:3100
```

The smoke test runs on the host and talks to the container over the published
port, so it exercises the same path a browser takes.

## If it fails

- **Every check fails with "connection refused"** — the upgrade never reached
  the handler. Check that `vite.config.ts` still passes
  `nitro({ serverDir: "server", features: { websocket: true } })`, and that
  `server/routes/ws/rooms/[token].ts` is still where nitro scans for routes.
- **Only the bogus-token check fails** — the upgrade is accepting tokens it
  should refuse. That is an auth regression, not a transport one; start at
  `src/features/collab/join.ts`.
- **Presence works but cursors don't arrive** — the peers are in different
  crossws namespaces. The upgrade hook pins the namespace to the drawing id;
  see `namespaceFor` in the route.
- **Checks that passed a moment ago now fail with "connection refused"** — a
  run spends about thirty token validations, so two back-to-back runs from one
  host trip the 60/min per-IP limit of spec §4.5. Wait out the minute; the
  limiter is working.
