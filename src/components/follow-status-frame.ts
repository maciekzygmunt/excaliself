import type { ViewportStatusFrame } from "@excalidraw/excalidraw/types"
import { useMemo } from "react"
import type { RoomPresence } from "@/features/collab/use-room"
import { m } from "@/paraglide/messages"

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
          label: m.collab_following({ name: participant.name }),
          color: "#fff",
          onClick: stopFollowing,
        },
      },
    [participant, stopFollowing],
  )
}
