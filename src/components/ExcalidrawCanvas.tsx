import type { ReactElement, ReactNode } from "react"
import "@excalidraw/excalidraw/index.css"
import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types"

interface ExcalidrawCanvasProps {
  initialData: ExcalidrawInitialDataState
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

export function ExcalidrawCanvas({
  initialData,
  children,
  renderTopRightUI,
  onChange,
}: ExcalidrawCanvasProps) {
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Excalidraw
        initialData={initialData}
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
