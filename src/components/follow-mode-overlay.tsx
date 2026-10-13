// Replaces Excalidraw's follow-mode chrome, which `styles.css` hides app-wide,
// so every canvas that joins a room must mount this.

import type { RoomPresence } from "@/features/collab/use-room"

export function FollowModeOverlay({ room }: { room: RoomPresence }) {
  const participant = room.followedParticipant
  if (!participant) return null

  return (
    <div
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
