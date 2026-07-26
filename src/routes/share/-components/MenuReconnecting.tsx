/**
 * The reconnect status as a burger-menu row, for the widths where it can't
 * be an island (spec §5.3).
 *
 * Same trade as {@link MenuParticipants}: Excalidraw's top strip lays our row
 * out after its toolbar without wrapping, so in mobile layout nothing in it
 * is visible at all. Above that layout this renders nothing and the island
 * pill stands alone.
 */

import { MainMenu, useDevice } from "@excalidraw/excalidraw"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import type { ConnectionStatus } from "@/features/collab/use-room"

export function MenuReconnecting({ status }: { status: ConnectionStatus }) {
  const device = useDevice()
  if (!device.editor.isMobile || status !== "reconnecting") return null

  return (
    <>
      <ReconnectingIndicator
        status={status}
        // A row, not an island: no card of its own, and free to use the
        // width the dropdown gives it.
        className="h-9 w-full bg-transparent px-2 shadow-none"
      />
      <MainMenu.Separator />
    </>
  )
}
