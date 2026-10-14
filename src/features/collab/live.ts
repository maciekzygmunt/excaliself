// Live badge payload. A Map scan with no db reads, so a ~25 s poll is cheap.

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
 * Drawings of `ownerId` with someone else in them. The owner's own tabs don't
 * count; a Room that failed to load has no owner and never shows.
 */
export function liveDrawingsForOwner(
  registry: RoomRegistry,
  ownerId: string,
): LiveDrawing[] {
  const live: LiveDrawing[] = []
  for (const [drawingId, room] of registry.rooms) {
    if (room.ownerId !== ownerId) continue

    const others = [...room.seats.values()]
      .filter((seat) => seat.userId !== ownerId)
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
