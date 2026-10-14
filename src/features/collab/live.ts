// Live badge payload. A Map scan with no db reads, so a ~25 s poll is cheap.

import { canAccess } from "@/features/spaces/access"
import type { ParticipantColor } from "./protocol"
import type { RoomRegistry } from "./room-session"

/** Deliberately no userIds or images. */
export type LiveParticipant = { name: string; color: ParticipantColor }

export type LiveDrawing = {
  drawingId: string
  /** True total; `participants` is capped. */
  count: number
  participants: LiveParticipant[]
}

/** Avatars shown before a "+N" tail. */
export const MAX_LIVE_AVATARS = 4

/**
 * Drawings `userId` can access with someone else in them. Their own tabs
 * don't count; a Room that failed to load is never shown.
 */
export function liveDrawingsFor(
  registry: RoomRegistry,
  userId: string,
): LiveDrawing[] {
  const live: LiveDrawing[] = []
  for (const [drawingId, room] of registry.rooms) {
    if (!room.access || !canAccess(room.access, userId)) continue

    const others = [...room.seats.values()]
      .filter((seat) => seat.userId !== userId)
      .map((seat) => seat.participant)
    if (others.length === 0) continue

    live.push({
      drawingId,
      count: others.length,
      participants: others
        .slice(0, MAX_LIVE_AVATARS)
        .map(({ name, color }) => ({ name, color })),
    })
  }
  return live
}
