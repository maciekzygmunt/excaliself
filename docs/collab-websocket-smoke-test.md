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

1. A token that does not exist is closed with the dead-link code (spec §5.3) —
   the socket opens and is told why, rather than being refused into an opaque
   1006 a reconnecting client would retry against forever.
2. A `PING` is answered with a `PONG` — the heartbeat that keeps a quiet
   session alive past a proxy's idle timeout (spec §5.3, rollout note 2).
3. A frame past the 4 MB cap closes the socket with 1009 (spec §5.4).
4. A valid token joins, and the server hands back a connection id and the roster.
5. Two peers see each other join, a name sent on `JOIN` reaches the other peer,
   a cursor is relayed to the other peer (and never echoed back to its sender),
   and closing one socket updates the other's roster.
6. The guest socket past the room's participant cap (one seat is kept for the
   owner) is closed with the room-full code (spec §4.5), and a departure
   reopens the slot.
7. A joiner is handed the room's scene as `SCENE_INIT`.
8. An edit by one peer reaches the other, is never echoed back to its sender,
   and is what a third peer joining afterwards is initialized from.
9. An edit that loses reconciliation is refused, and the room hands its sender
   the version that won.
10. The last socket out flushes the room's scene to `drawings.data` (spec §2.3),
    and the flush is elements-only — `appState` comes through untouched. This
    one reads Postgres directly, so it is skipped when `DATABASE_URL` is unset.

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
- **Only the bogus-token check fails** — either the upgrade is accepting tokens
  it should refuse, or it is refusing them the wrong way. Both are auth
  regressions, not transport ones; start at `src/features/collab/join.ts` and
  the `refused` branch of the route's `upgrade`. A `connection refused` here
  rather than a close code means the handshake is being rejected again, which
  puts reconnecting clients back in a retry loop against a dead link.
- **Presence works but cursors don't arrive** — the peers are in different
  crossws namespaces. The upgrade hook pins the namespace to the drawing id;
  see `namespaceFor` in the route.
- **Checks fail with "connection refused"** — the host has spent the 60/min
  per-IP budget of failed token lookups (spec §4.5). A run spends only one, so
  something else on the host is hitting dead links. Wait out the minute.
- **Presence works but no `SCENE_INIT` arrives** — the Room could not read its
  drawing. It stays open on an empty scene by design; the reason is logged as
  `[collab] could not load scene for room <id>`.
