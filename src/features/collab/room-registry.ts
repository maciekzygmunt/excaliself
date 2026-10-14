// This process's live Rooms. In-memory, so the app stays single-replica.

import { db } from "@/db"
import { processSingleton } from "@/lib/process-singleton"
import {
  closeAllRooms,
  createRoomRegistry,
  PARTICIPANT_SWEEP_INTERVAL_MS,
  type RoomRegistry,
  sweepSilentParticipants,
  terminateRoom,
} from "./room-session"
import { loadRoomScene, saveRoomScene } from "./scene-store"
import { registerShutdownFlush } from "./shutdown"

/** One per process, so SIGTERM gets one shutdown handler, not one per bundle. */
export const rooms: RoomRegistry = processSingleton("collab-rooms", () => {
  const registry = createRoomRegistry(
    (roomId) => loadRoomScene(db, roomId),
    (roomId, elements) => saveRoomScene(db, roomId, elements),
  )
  registerShutdownFlush(() => closeAllRooms(registry))
  // Unref'd, so it never holds the process open.
  setInterval(
    () => void sweepSilentParticipants(registry),
    PARTICIPANT_SWEEP_INTERVAL_MS,
  ).unref()
  return registry
})

/** Ends these drawings' Rooms: each one flushes, then hangs up. */
export async function endRooms(drawingIds: string[]): Promise<void> {
  await Promise.all(drawingIds.map((id) => terminateRoom(rooms, id)))
}
