/** Menu-row variant for widths where the avatars don't fit the top row. */

import { MainMenu } from "@excalidraw/excalidraw"
import type { RoomPresence } from "@/features/collab/use-room"

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
        title={`${participants.length} other ${participants.length === 1 ? "person" : "people"} here`}
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
                ? `Stop following ${participant.name}`
                : participant.name}
            </MainMenu.Item>
          )
        })}
      </MainMenu.Group>
      <MainMenu.Separator />
    </div>
  )
}
