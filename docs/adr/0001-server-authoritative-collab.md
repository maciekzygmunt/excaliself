# Server-authoritative collab on the excalidraw-room protocol, without E2E

Live canvas sharing reuses excalidraw-room's message shapes (SCENE_INIT / SCENE_UPDATE / MOUSE_LOCATION / IDLE_STATUS / USER_VISIBLE_SCENE_BOUNDS, per-element deltas gated by scene version, 20s full-sync) as plain JSON over an in-process nitro websocket — but deliberately drops upstream's end-to-end encryption envelope. The server must read every message because it, not the clients, is authoritative: each live Room holds the reconciled scene in memory (via the ported `reconcileElements` merge rule) and flushes elements-only to `drawings.data` on a ~15s trailing throttle, on last-leave, and on graceful shutdown. This is what makes guest edits survive the owner closing their tab — the requirement upstream's relay-plus-client-persistence model cannot meet.

## Consequences

- While a Room is live, the socket path is the **only** writer; the owner joins the Room like any guest and the classic `saveDrawingScene` autosave is suspended for that session. Unshared drawings keep the existing path untouched.
- Stored `appState` is frozen at the last solo save: scene-level tweaks (background color, grid) made mid-session neither sync nor persist — same trade-off excalidraw.com makes.
- Image blobs never ride the socket: they POST out-of-band to a room-scoped endpoint that writes `drawing_files` immediately; peers fetch unseen `fileId`s and inject via `addFiles()`.
- A hard crash loses at most ~15s of edits from the DB; reconnecting clients reconcile and re-broadcast, so real loss only hits edits from clients that never return. Rejected alternatives: 1–2s debounce (whole-scene JSON rewrites too heavy), per-message write-ahead log (out of proportion for a self-hosted whiteboard).
- Room state is in-memory per process — the app must stay single-replica unless a backplane is added.
