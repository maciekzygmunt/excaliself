/**
 * The reconnect status as a burger-menu row, for the canvas widths where the
 * top-row pill doesn't fit (spec §5.3). The host hides it above that width.
 */

import { MainMenu } from "@excalidraw/excalidraw"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import type { ConnectionStatus } from "@/features/collab/use-room"

export function MenuReconnecting({
  status,
  className,
}: {
  status: ConnectionStatus
  className?: string
}) {
  if (status !== "reconnecting") return null

  return (
    <div className={className}>
      <ReconnectingIndicator
        status={status}
        // A row, not an island: no card of its own, and free to use the
        // width the dropdown gives it.
        className="h-9 w-full bg-transparent px-2 shadow-none"
      />
      <MainMenu.Separator />
    </div>
  )
}
