/**
 * The live badge's payload (canvas sharing spec §1.5): which of the caller's
 * own drawings have someone *else* in them right now.
 *
 * A Map scan over the live Rooms and nothing more — each Room already caches
 * the drawing's `ownerId` from its spin-up read, so answering costs no
 * database work at all. That is what makes a ~25 s poll from every open
 * gallery affordable.
 */

import type { ParticipantColor } from "./protocol"
import type { RoomRegistry } from "./room-session"

/** What an avatar needs, and deliberately nothing more: no userIds, no images. */
export type LiveParticipant = { name: string; color: ParticipantColor }

export type LiveDrawing = {
  drawingId: string
  /** Everyone else in the room — the true total, which `participants` may not reach. */
  count: number
  participants: LiveParticipant[]
}

/** What the avatar stack shows before the rest becomes a "+N" tail. */
export const MAX_LIVE_AVATARS = 4

/**
 * The badge means "someone else is in your drawing", so the caller's own
 * connections are dropped first — otherwise every drawing you had open would
 * wear a badge for you. Guests carry no userId, so they always count.
 *
 * A Room whose drawing failed to load has a null `ownerId` and belongs to
 * nobody: presence still works for the people in it, but it never surfaces
 * here rather than surfacing to the wrong person.
 */
export function liveDrawingsForOwner(
  registry: RoomRegistry,
  ownerId: string,
): LiveDrawing[] {
  const live: LiveDrawing[] = []
  for (const [drawingId, room] of registry.rooms) {
    if (room.ownerId !== ownerId) continue

    const others = [...room.participants.values()].filter(
      (participant) => room.userIds.get(participant.connectionId) !== ownerId,
    )
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
