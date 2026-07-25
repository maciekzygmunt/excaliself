// The canvas a share-link visitor lands on (canvas sharing #116). Edits are
// deliberately local-only for now — no autosave, no sockets; live collab and
// guest chrome arrive in later slices. Always light, per the logged-out
// pages convention (spec §1.3).

import { Excalidraw } from "@excalidraw/excalidraw"
import { useMemo } from "react"
import {
  buildInitialSceneData,
  type PersistedFile,
} from "@/features/drawings/scene"

import "@excalidraw/excalidraw/index.css"

type Props = {
  drawing: { id: string; name: string; data: string }
  files: PersistedFile[]
}

export function SharedCanvas({ drawing, files }: Props) {
  const initialData = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }).initialData,
    [drawing.data, files],
  )

  return (
    <div className="h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        theme="light"
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
