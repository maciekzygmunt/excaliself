import type { ViewportStatusFrame } from "@excalidraw/excalidraw/types"
import { useMemo } from "react"
import type { RoomPresence } from "@/features/collab/use-room"

/**
 * The canvas's `viewportStatusFrame` while following someone: a ring and a
 * badge in their color, which stops the follow on click.
 */
export function useFollowStatusFrame(
  room: RoomPresence,
): ViewportStatusFrame | null {
  const { followedParticipant: participant, stopFollowing } = room
  return useMemo(
    () =>
      participant && {
        border: participant.color.background,
        label: {
          label: `Following ${participant.name} — click to stop`,
          color: "#fff",
          onClick: stopFollowing,
        },
      },
    [participant, stopFollowing],
  )
}
