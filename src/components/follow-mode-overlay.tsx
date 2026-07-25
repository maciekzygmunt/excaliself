/**
 * What following someone looks like (spec §1.3): an inset ring around the
 * canvas in that person's cursor color, and a chip at the bottom saying whose
 * viewport you are riding along in. The whole chip is the way out.
 *
 * Excalidraw draws chrome of its own for `appState.userToFollow` — a blue
 * ring and a badge with a close button. `.follow-mode` is hidden in
 * `styles.css` so this one stands in its place, in the participant's color
 * and with copy that says what clicking does.
 */

import type { Participant } from "@/features/collab/protocol"

export function FollowModeOverlay({
  participant,
  onStop,
}: {
  /** The person being followed; null renders nothing. */
  participant: Participant | null
  onStop: () => void
}) {
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
        onClick={onStop}
        className="pointer-events-auto mb-4 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: participant.color.background }}
      >
        Following {participant.name} — click to stop
      </button>
    </div>
  )
}
