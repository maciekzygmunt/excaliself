// This process's live Rooms. In-memory, so the app stays single-replica.

import { db } from "@/db"
import { processSingleton } from "@/lib/process-singleton"
import { registerShutdownFlush } from "@/lib/socket/shutdown"
import {
  closeAllRooms,
  createRoomRegistry,
  PARTICIPANT_SWEEP_INTERVAL_MS,
  type RoomRegistry,
  sweepSilentParticipants,
  terminateRoom,
  trashRoom,
} from "./room-session"
import { loadRoomScene, saveRoomScene } from "./scene-store"

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

/** Ends these trashed drawings' Rooms, telling members who trashed them. */
export async function endTrashedRooms(
  drawingIds: string[],
  trasher: { userId: string; name: string },
): Promise<void> {
  await Promise.all(drawingIds.map((id) => trashRoom(rooms, id, trasher)))
}
