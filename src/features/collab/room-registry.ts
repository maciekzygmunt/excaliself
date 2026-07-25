/**
 * This process's live Rooms — the one registry every surface talks to.
 *
 * In-memory by design (spec §2.3): the app stays single-replica until a
 * pub/sub backplane is added.
 */

import { db } from "@/db"
import { createRoomRegistry, type RoomRegistry } from "./room-session"
import { loadRoomScene } from "./scene-store"

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

const host = globalThis as Host
host[REGISTRY] ??= createRoomRegistry((roomId) => loadRoomScene(db, roomId))

export const rooms: RoomRegistry = host[REGISTRY]
