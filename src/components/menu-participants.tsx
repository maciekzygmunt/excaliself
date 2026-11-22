/** Menu-row variant for widths where the avatars don't fit the top row. */

import { MainMenu } from "@excalidraw/excalidraw"
import type { RoomPresence } from "@/features/collab/use-room"
import { m } from "@/paraglide/messages"

export function MenuParticipants({
  room,
  className,
}: {
  room: RoomPresence
  className?: string
}) {
  const participants = room.others
  const followedConnectionId = room.followedParticipant?.connectionId
  if (participants.length === 0) return null

  return (
    <div className={className}>
      <MainMenu.Group
        title={m.collab_others_here({ count: participants.length })}
      >
        {participants.map((participant) => {
          const followed = participant.connectionId === followedConnectionId
          return (
            <MainMenu.Item
              key={participant.connectionId}
              onSelect={() => room.toggleFollow(participant)}
              icon={
                <span
                  aria-hidden="true"
                  className="block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: participant.color.background }}
                />
              }
            >
              {followed
                ? m.collab_stop_following({ name: participant.name })
                : participant.name}
            </MainMenu.Item>
          )
        })}
      </MainMenu.Group>
      <MainMenu.Separator />
    </div>
  )
}
