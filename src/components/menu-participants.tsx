/**
 * The room's other participants as burger-menu rows, for the canvas widths
 * where the avatars don't fit the top row. The host hides it above that
 * width with `className`. Each row is a way into follow mode.
 */

import { MainMenu } from "@excalidraw/excalidraw"
import type { Participant } from "@/features/collab/protocol"

export function MenuParticipants({
  participants,
  followedConnectionId,
  onFollow,
  className,
}: {
  participants: readonly Participant[]
  followedConnectionId: string | null
  onFollow: (participant: Participant) => void
  className?: string
}) {
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
              onSelect={() => onFollow(participant)}
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
