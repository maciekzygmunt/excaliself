// The guest canvas surface for /share/<token> (canvas-sharing spec §1.3).
// This slice renders the shared drawing on a plain canvas — edits stay local
// to the tab; live collaboration, persistence, and guest chrome arrive in
// later slices. Guest pages are always light, like every logged-out surface.

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

export function GuestCanvas({ drawing, files }: Props) {
  const { initialData } = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }),
    [drawing.data, files],
  )

  return (
    <div className="size-full">
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

export default GuestCanvas
