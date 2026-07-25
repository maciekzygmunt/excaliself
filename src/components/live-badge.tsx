/**
 * "Someone else is in this drawing right now", on the owner's two browsing
 * surfaces (canvas sharing spec §1.5).
 *
 * The gallery card gets the avatar stack — the same initials and the same
 * participant colors the cursors will be wearing when the owner clicks in, so
 * the badge and the room look like the same people. The sidebar row, which
 * has a line of text and no room for faces, gets the count alone.
 *
 * Both are ornament, not controls: clicking a live card just opens the
 * drawing, which joins the session. So neither is focusable, and both let
 * clicks fall through to the row's own link.
 */

import { initialsOf } from "@/features/collab/identity"
import type { LiveDrawing } from "@/features/collab/live"
import { cn } from "@/lib/utils"

/**
 * One sentence for both surfaces, so the sidebar chip and the gallery card
 * don't describe the same room two different ways. Past one person the names
 * are dropped — four of them read aloud is noise, and the count is the fact.
 */
function liveLabel(live: LiveDrawing): string {
  const [first] = live.participants
  if (live.count > 1) return `${live.count} people are in this drawing`
  return first
    ? `${first.name} is in this drawing`
    : "1 person is in this drawing"
}

/** The gallery card's corner stack: overlapping faces, then a "+N" tail. */
export function LiveAvatarStack({
  live,
  className,
}: {
  live: LiveDrawing | null
  className?: string
}) {
  if (!live) return null

  const overflow = live.count - live.participants.length

  return (
    <div
      role="img"
      aria-label={liveLabel(live)}
      className={cn(
        // The card's stretched link is a DOM sibling underneath: staying out
        // of the pointer's way is what keeps the whole preview clickable.
        "pointer-events-none flex items-center -space-x-1.5",
        className,
      )}
    >
      {live.participants.map((participant, i) => (
        // No `title`: the stack takes no pointer events, so a native tooltip
        // could never open. The names live in the label above instead.
        <span
          // Two guests can land on the same pseudonym and the payload carries
          // no connection ids, so position is the only stable key here.
          key={i}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-card"
          style={{ backgroundColor: participant.color.background }}
        >
          {initialsOf(participant.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex h-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
          +{overflow}
        </span>
      )}
    </div>
  )
}

/** The sidebar row's count, in the palette's one green. */
export function LiveCountChip({
  live,
  className,
}: {
  live: LiveDrawing | null
  className?: string
}) {
  if (!live) return null

  return (
    <span
      role="img"
      aria-label={liveLabel(live)}
      className={cn(
        "pointer-events-none flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-live-muted px-1 text-[10px] font-semibold text-live tabular-nums",
        className,
      )}
    >
      {live.count}
    </span>
  )
}
