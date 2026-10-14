// A status, not a warning: edits keep landing and the rejoin merges them, so
// there is no Retry button.

import type { ConnectionStatus } from "@/features/collab/use-room"
import { cn } from "@/lib/utils"

export function ReconnectingIndicator({
  status,
  className,
}: {
  status: ConnectionStatus
  className?: string
}) {
  if (status !== "reconnecting") return null

  return (
    <div
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
