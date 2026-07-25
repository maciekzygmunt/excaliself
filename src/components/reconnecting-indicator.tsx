/**
 * The quiet "Reconnecting…" indicator of canvas sharing spec §5.3.
 *
 * Deliberately understated: the canvas keeps working while it is up, edits
 * keep landing, and the rejoin merges both sides — so this is a status, not
 * a warning. There is no "lost work" copy anywhere near it, and no button:
 * the reconnect is automatic and indefinite, and a Retry would only offer
 * the visitor a way to do worse than waiting.
 *
 * It sits in Excalidraw's top-right island row, in the space the presence
 * avatars have just vacated — a disconnected tab has no roster to show, so
 * the two never compete for the row.
 *
 * Lives here rather than under the share route because any surface that
 * joins a Room needs it. Today that is the guest canvas; the member canvas
 * joins a Room with the autosave handoff (#120).
 */

import type { ConnectionStatus } from "@/features/collab/use-room"
import { cn } from "@/lib/utils"

export function ReconnectingIndicator({
  status,
  className,
}: {
  status: ConnectionStatus
  /** Lets a host hide the pill, or drop its island styling inside a menu. */
  className?: string
}) {
  // The first dial is not a reconnection: the page is already showing its
  // own loader, and a second one saying the same thing reads as a fault.
  if (status !== "reconnecting") return null

  return (
    <div
      // `status` rather than `alert`: politely announced when a screen reader
      // is idle, never interrupting whatever the visitor is doing.
      role="status"
      className={cn(
        "flex h-(--lg-button-size) items-center gap-2 rounded-(--border-radius-lg) bg-(--island-bg-color) px-3 shadow-(--shadow-island)",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none"
      />
      <span className="text-[0.8125rem] font-medium text-(--color-gray-60)">
        Reconnecting…
      </span>
    </div>
  )
}
