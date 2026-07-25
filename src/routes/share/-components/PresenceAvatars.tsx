/**
 * Who else is in the room, as a stack of initialed avatars in Excalidraw's
 * top-right island (spec §1.3). Deliberately minimal: the guest chrome slice
 * adds the editable name pill beside it and settles the final styling.
 *
 * Only other people are shown — you already know you're here — so a lone
 * visitor gets no chrome at all.
 */

import type { Participant } from "@/features/collab/protocol"

/** Beyond this the stack turns into a "+N" tail rather than growing. */
const MAX_AVATARS = 4

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0]
  const last = words.length > 1 ? words[words.length - 1] : ""
  return [first, last]
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2)
}

export function PresenceAvatars({
  participants,
}: {
  participants: readonly Participant[]
}) {
  if (participants.length === 0) return null

  const shown = participants.slice(0, MAX_AVATARS)
  const overflow = participants.length - shown.length

  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={`${participants.length} other ${participants.length === 1 ? "person" : "people"} here`}
    >
      {shown.map((participant) => (
        <span
          key={participant.connectionId}
          title={participant.name}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[0.625rem] font-semibold text-white ring-2 ring-(--island-bg-color)"
          style={{ backgroundColor: participant.color.background }}
        >
          {initialsOf(participant.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex h-7 items-center justify-center rounded-full bg-(--color-surface-low) px-1.5 text-[0.625rem] font-semibold text-(--color-on-surface) ring-2 ring-(--island-bg-color)">
          +{overflow}
        </span>
      )}
    </div>
  )
}
