import { useCallback, useEffect, useRef } from "react"
import "@excalidraw/excalidraw/index.css"
import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"

interface ExcalidrawCanvasProps {
  initialData: ExcalidrawInitialDataState
  scene?: ExcalidrawInitialDataState
  onChange?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void
}

export function ExcalidrawCanvas({
  initialData,
  scene,
  onChange,
}: ExcalidrawCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneRef = useRef<ExcalidrawInitialDataState | null>(null)

  const scheduleSceneUpdate = useCallback(
    (sceneToApply: ExcalidrawInitialDataState) => {
      // Defer updates until after mount to avoid setState-before-mount warnings.
      requestAnimationFrame(() => {
        const api = apiRef.current
        if (api) {
          api.updateScene(
            sceneToApply as Parameters<
              ExcalidrawImperativeAPI["updateScene"]
            >[0],
          )
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!scene) return
    sceneRef.current = scene
    if (apiRef.current) {
      scheduleSceneUpdate(scene)
    }
  }, [scene, scheduleSceneUpdate])

  const handleApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      if (sceneRef.current) {
        scheduleSceneUpdate(sceneRef.current)
      }
    },
    [scheduleSceneUpdate],
  )

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={handleApi}
        onChange={onChange}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  )
}
