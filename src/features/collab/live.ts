// Live badge payload. A Map scan with no db reads, so a ~25 s poll is cheap.

import { canAccess } from "@/features/spaces/access"
import type { ParticipantColor } from "./protocol"
import type { RoomRegistry } from "./room-session"

/** Deliberately no userIds or images. */
export type LiveParticipant = { name: string; color: ParticipantColor }

export type LiveDrawing = {
  drawingId: string
  /** People, not tabs. True total; `participants` is capped. */
  count: number
  participants: LiveParticipant[]
}

export type LiveSnapshot = {
  drawings: LiveDrawing[]
  /** People live anywhere in Team, once each, minus the caller. */
  teamCount: number
}

/** Avatars shown before a "+N" tail. */
export const MAX_LIVE_AVATARS = 4

/**
 * Drawings `userId` can access with someone else in them. Their own tabs
 * don't count; a Room that failed to load is never shown. A member counts
 * once however many tabs they have; each guest connection is one person.
 */
export function liveFor(registry: RoomRegistry, userId: string): LiveSnapshot {
  const drawings: LiveDrawing[] = []
  const inTeam = new Set<string>()
  for (const [drawingId, room] of registry.rooms) {
    if (!room.access || !canAccess(room.access, userId)) continue

    // Keyed by userId, or by connection id for guests.
    const people = new Map<string, LiveParticipant>()
    for (const [connectionId, seat] of room.seats) {
      if (seat.userId === userId) continue
      const key = seat.userId ?? connectionId
      if (people.has(key)) continue
      const { name, color } = seat.participant
      people.set(key, { name, color })
      if (room.access.space === "team") inTeam.add(key)
    }
    if (people.size === 0) continue

    drawings.push({
      drawingId,
      count: people.size,
      participants: [...people.values()].slice(0, MAX_LIVE_AVATARS),
    })
  }
  return { drawings, teamCount: inTeam.size }
}
