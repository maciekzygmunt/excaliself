# Server-authoritative collab on the excalidraw-room protocol, without E2E

Live canvas sharing reuses excalidraw-room's message shapes (SCENE_INIT / SCENE_UPDATE / MOUSE_LOCATION / IDLE_STATUS / USER_VISIBLE_SCENE_BOUNDS, per-element deltas gated by scene version, 20s full-sync) as plain JSON over an in-process nitro websocket — but deliberately drops upstream's end-to-end encryption envelope. The server must read every message because it, not the clients, is authoritative: each live Room holds the reconciled scene in memory (via the ported `reconcileElements` merge rule) and flushes elements-only to `drawings.data` on a ~15s trailing throttle, on last-leave, and on graceful shutdown. This is what makes guest edits survive the owner closing their tab — the requirement upstream's relay-plus-client-persistence model cannot meet.

## Consequences

- While a Room is live, the socket path is the **only** writer; the owner joins the Room like any guest and the classic `saveDrawingScene` autosave is suspended for that session. Unshared drawings keep the existing path untouched.
- Stored `appState` is frozen at the last solo save: scene-level tweaks (background color, grid) made mid-session neither sync nor persist — same trade-off excalidraw.com makes.
- Image blobs never ride the socket: they POST out-of-band to a room-scoped endpoint that writes `drawing_files` immediately; peers fetch unseen `fileId`s and inject via `addFiles()`.
- A hard crash loses at most ~15s of edits from the DB; reconnecting clients reconcile and re-broadcast, so real loss only hits edits from clients that never return. Rejected alternatives: 1–2s debounce (whole-scene JSON rewrites too heavy), per-message write-ahead log (out of proportion for a self-hosted whiteboard).
- Room state is in-memory per process — the app must stay single-replica unless a backplane is added.
- Follow mode needed two frames upstream carries out-of-band, in synthetic `follow@<socketId>` socket.io rooms: `USER_FOLLOW` (a follower naming its target) and `FOLLOWED_BY` (the server telling a peer who is trailing it). With no socket.io rooms to lean on, each Room keeps the follower→followed map itself and sends `USER_VISIBLE_SCENE_BOUNDS` to just those peers, so a room where nobody follows anybody carries no viewport traffic at all. Mutual follows are pruned on the server, per recipient, which is also what keeps a pair from dragging each other's canvas back and forth.

## Implementation notes

- **Link changes:** every stop, regenerate, audience change and trash writes the `shares` row first, then updates the Room. A socket is seated first and then checks its token again, so a link that dies during the handshake either fails that check or finds the seat to evict.
- **Close codes:** a dead link or a full room is an accepted socket closed with 4010 or 4029. A refused handshake reaches the browser as an opaque 1006, which a client cannot tell from an outage, so it would retry forever. 4010 is the only close that stops reconnecting (and 4029 before the first join).
- **Ending a Room:** seats are cleared before the final flush, which freezes the scene that write sees. Clearing them after would let an edit merge mid-write and land later as a retry over the owner's newer solo saves.
- **Unreadable scenes:** a Room whose stored scene can't be parsed relays edits but never writes, so an empty canvas never replaces a recoverable file.
- **Ghost seats:** silent connections are swept on join, not on a timer. A half-open socket holds one of the 25 seats, and enough of them would refuse a reconnecting tab that holds unsaved edits.
- **One instance per process:** the websocket route and the server functions are separate bundles, so the Room registry and rate limiters live on `globalThis` (`processSingleton`).
- **Client traffic:** cursors, viewports and scene deltas stay in refs and go straight to `updateScene`; only the roster is React state. Frames are split under the server's frame cap, because an oversized frame closes the socket and a resend would loop.
- **Images:** the `drawing_files` row is written before an element turns `saved`. 400, 413 and 429 are final; network errors, 5xx and 401 retry. Uploads are limited per IP per room; reads are not limited, because a late joiner fetches every image and the 256-bit token guards them.
- **Client IP:** `x-forwarded-for` is trusted only from a private or loopback peer, using the rightmost hop.
- **Rollback:** the shares migration dropped `drawings.isPublic` and there are no down-migrations. Before rolling back to an image older than sharing, run `ALTER TABLE drawings ADD COLUMN "isPublic" boolean NOT NULL DEFAULT false;`.
