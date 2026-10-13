/**
 * What following someone looks like (spec §1.3): an inset ring around the
 * canvas in that person's cursor color, and a chip at the bottom saying whose
 * viewport you are riding along in. The whole chip is the way out.
 *
 * Excalidraw draws chrome of its own for `appState.userToFollow` — a blue
 * ring and a badge with a close button. `.follow-mode` is hidden in
 * `styles.css` so this one stands in its place, in the participant's color
 * and with copy that says what clicking does.
 *
 * That CSS is app-wide, so every surface that joins a Room mounts this: the
 * guest canvas and the owner's canvas.
 */

import type { RoomPresence } from "@/features/collab/use-room"

export function FollowModeOverlay({ room }: { room: RoomPresence }) {
  const participant = room.followedParticipant
  if (!participant) return null

  return (
    <div
      // Above the canvas and Excalidraw's islands, but transparent to the
      // pointer everywhere except the chip — following is not view mode.
      className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center border-2"
      style={{ borderColor: participant.color.background }}
    >
      <button
        type="button"
        onClick={room.stopFollowing}
        className="pointer-events-auto mb-4 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: participant.color.background }}
      >
        Following {participant.name} — click to stop
      </button>
    </div>
  )
}
