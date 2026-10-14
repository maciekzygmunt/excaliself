/** Menu-row variant for widths where the top-row pill doesn't fit. */

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
        className="h-9 w-full bg-transparent px-2 shadow-none"
      />
      <MainMenu.Separator />
    </div>
  )
}
