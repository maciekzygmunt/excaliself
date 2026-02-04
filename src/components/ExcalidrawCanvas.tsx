import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react"
import "@excalidraw/excalidraw/index.css"
import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types"

interface ExcalidrawCanvasProps {
  initialData: ExcalidrawInitialDataState
  scene?: ExcalidrawInitialDataState
  children?: ReactNode
  renderTopRightUI?: (
    isMobile: boolean,
    appState: UIAppState,
  ) => ReactElement | null
  onChange?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void
}

function useSceneSync(scene?: ExcalidrawInitialDataState) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneRef = useRef<ExcalidrawInitialDataState | null>(null)
  const rafRef = useRef<number | null>(null)

  const applyScene = useCallback((sceneToApply: ExcalidrawInitialDataState) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    // Defer updates until after mount to avoid setState-before-mount warnings.
    rafRef.current = requestAnimationFrame(() => {
      const api = apiRef.current
      if (api) {
        api.updateScene(
          sceneToApply as Parameters<
            ExcalidrawImperativeAPI["updateScene"]
          >[0],
        )
      }
    })
  }, [])

  useEffect(() => {
    if (!scene) return
    sceneRef.current = scene
    if (apiRef.current) {
      applyScene(scene)
    }
  }, [scene, applyScene])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const handleApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      if (sceneRef.current) {
        applyScene(sceneRef.current)
      }
    },
    [applyScene],
  )

  return handleApi
}

export function ExcalidrawCanvas({
  initialData,
  scene,
  children,
  renderTopRightUI,
  onChange,
}: ExcalidrawCanvasProps) {
  const handleApi = useSceneSync(scene)

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={handleApi}
        onChange={onChange}
        renderTopRightUI={renderTopRightUI}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        {children}
      </Excalidraw>
    </div>
  )
}
