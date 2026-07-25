/**
 * The room's other participants as burger-menu rows, for the widths where
 * they can't be avatars (spec §1.3).
 *
 * Excalidraw's top strip lays our row out after its toolbar without wrapping,
 * so once it collapses to mobile layout the avatars start past the right edge
 * — no count of them fits, not even one. There they move in here instead,
 * where a row is still the way into follow mode.
 *
 * Above that layout the avatars are in the island where they belong, and this
 * renders nothing: two ways to reach the same people would just be noise.
 */

import { MainMenu, useDevice } from "@excalidraw/excalidraw"
import type { Participant } from "@/features/collab/protocol"

export function MenuParticipants({
  participants,
  followedConnectionId,
  onFollow,
}: {
  participants: readonly Participant[]
  followedConnectionId: string | null
  onFollow: (participant: Participant) => void
}) {
  const device = useDevice()
  if (!device.editor.isMobile || participants.length === 0) return null

  return (
    <>
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
    </>
  )
}
