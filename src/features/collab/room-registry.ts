// This process's live Rooms. In-memory, so the app stays single-replica.

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

/** One per process, so SIGTERM gets one flush handler, not one per bundle. */
export const rooms: RoomRegistry = processSingleton("collab-rooms", () => {
  const registry = createRoomRegistry(
    (roomId) => loadRoomScene(db, roomId),
    (roomId, elements) => saveRoomScene(db, roomId, elements),
  )
  registerShutdownFlush(() => flushAllRooms(registry))
  return registry
})

/** Ends these drawings' Rooms: each one flushes, then hangs up. */
export async function endRooms(drawingIds: string[]): Promise<void> {
  await Promise.all(drawingIds.map((id) => terminateRoom(rooms, id)))
}
