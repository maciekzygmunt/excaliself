/**
 * Room presence, in the shape Excalidraw renders it: `updateScene({
 * collaborators })` draws every entry's cursor and label (spec §2.2).
 *
 * Pure, and rebuilt from the roster rather than patched in place, so a
 * participant who left can't leave a stale cursor behind — their pointer is
 * simply not reachable from the new roster.
 */

import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types"
import type { Participant, PointerUpdate } from "./protocol"

export function toCollaborators(input: {
  participants: readonly Participant[]
  /** Last cursor seen per connection id. */
  pointers: ReadonlyMap<string, PointerUpdate>
  /** This tab's own connection id, which Excalidraw must not draw. */
  selfId: string | null
}): Map<SocketId, Collaborator> {
  const collaborators = new Map<SocketId, Collaborator>()
  for (const participant of input.participants) {
    if (participant.connectionId === input.selfId) continue
    const socketId = participant.connectionId as SocketId
    const cursor = input.pointers.get(participant.connectionId)
    collaborators.set(socketId, {
      id: participant.connectionId,
      socketId,
      username: participant.name,
      color: participant.color,
      pointer: cursor?.pointer,
      button: cursor?.button,
      selectedElementIds: cursor?.selectedElementIds,
    })
  }
  return collaborators
}
