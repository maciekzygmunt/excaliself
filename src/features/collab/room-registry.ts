/**
 * This process's live Rooms — the one registry every surface talks to.
 *
 * In-memory by design (spec §2.3): the app stays single-replica until a
 * pub/sub backplane is added. Rooms read their drawing on the first join and
 * write it back on the ~15 s dirty throttle, on last-leave, and on SIGTERM.
 */

import { db } from "@/db"
import { processSingleton } from "@/lib/process-singleton"
import {
  createRoomRegistry,
  flushAllRooms,
  type RoomRegistry,
  terminateRoom,
} from "./room-session"
import { loadRoomScene, saveRoomScene } from "./scene-store"
import { registerShutdownFlush } from "./shutdown"

/**
 * Runs once per process, so SIGTERM gets one flush handler, not one per bundle.
 */
export const rooms: RoomRegistry = processSingleton("collab-rooms", () => {
  const registry = createRoomRegistry(
    (roomId) => loadRoomScene(db, roomId),
    (roomId, elements) => saveRoomScene(db, roomId, elements),
  )
  // The process's own exit stays srvx's business; see shutdown.ts.
  registerShutdownFlush(() => flushAllRooms(registry))
  return registry
})

/** Ends these drawings' live Rooms in parallel: each one flushes, then hangs up. */
export async function endRooms(drawingIds: string[]): Promise<void> {
  await Promise.all(drawingIds.map((id) => terminateRoom(rooms, id)))
}
