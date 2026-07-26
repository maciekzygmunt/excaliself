/**
 * This process's live Rooms — the one registry every surface talks to.
 *
 * In-memory by design (spec §2.3): the app stays single-replica until a
 * pub/sub backplane is added. Rooms read their drawing on the first join and
 * write it back on the ~15 s dirty throttle, on last-leave, and on SIGTERM.
 */

import { db } from "@/db"
import {
  createRoomRegistry,
  flushAllRooms,
  type RoomRegistry,
} from "./room-session"
import { loadRoomScene, saveRoomScene } from "./scene-store"
import { registerShutdownFlush } from "./shutdown"

/**
 * The build splits the app across bundles — the nitro websocket route and the
 * server functions are separate rollup outputs — so a plain module-level
 * `const` would give the socket and the live-badge handler a registry each,
 * and the badge would look at a permanently empty Map. They do share a
 * process, so the registered symbol is what makes the registry one.
 *
 * Same reasoning, and the same shape, as the share-token rate limiter.
 */
const REGISTRY = Symbol.for("excaliself.collab-rooms")
type Host = typeof globalThis & { [REGISTRY]?: RoomRegistry }

/**
 * Runs once per process, whichever bundle touches the registry first — which
 * is also why the shutdown flush is registered in here rather than in the
 * websocket route. Registering it per module load would put two handlers on
 * SIGTERM, racing two flushes onto the same rows.
 */
function createHostRegistry(): RoomRegistry {
  const registry = createRoomRegistry(
    (roomId) => loadRoomScene(db, roomId),
    (roomId, elements) => saveRoomScene(db, roomId, elements),
  )
  // The process's own exit stays srvx's business; see shutdown.ts.
  registerShutdownFlush(() => flushAllRooms(registry))
  return registry
}

const host = globalThis as Host
host[REGISTRY] ??= createHostRegistry()

export const rooms: RoomRegistry = host[REGISTRY]
