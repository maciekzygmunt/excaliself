// The canvas a share-link visitor lands on. It joins the drawing's room on
// open, so everyone here sees each other's cursors and presence (canvas
// sharing #118). Scene edits are still local — sync and persistence are the
// next slices. Always light, per the logged-out pages convention (spec §1.3).

import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useMemo, useState } from "react"
import { getOrCreateGuestName } from "@/features/collab/guest-identity"
import { useRoom } from "@/features/collab/use-room"
import {
  buildInitialSceneData,
  type PersistedFile,
} from "@/features/drawings/scene"
import { PresenceAvatars } from "./PresenceAvatars"

import "@excalidraw/excalidraw/index.css"

type Props = {
  drawing: { id: string; name: string; data: string }
  files: PersistedFile[]
  /** The share token this visitor arrived on; also the room's dial string. */
  token: string
  /** The room refused this visitor at its participant cap (spec §4.5). */
  onRoomFull: () => void
}

export function SharedCanvas({ drawing, files, token, onRoomFull }: Props) {
  const initialData = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }).initialData,
    [drawing.data, files],
  )
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  // The name a guest kept from a previous visit, generated on first arrival.
  // Signed-in members send it too; the server ignores it for them and uses
  // the session's display name instead.
  const [name] = useState(() => getOrCreateGuestName())

  const { others, onPointerUpdate } = useRoom({
    token,
    name,
    excalidrawAPI,
    onRoomFull,
  })

  return (
    <div className="h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawAPI}
        theme="light"
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={() => <PresenceAvatars participants={others} />}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  )
}

export default SharedCanvas
