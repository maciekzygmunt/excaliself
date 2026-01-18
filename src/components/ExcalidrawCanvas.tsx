"use client"

import { useEffect, useState } from "react"
import type { ComponentType } from "react"
import "@excalidraw/excalidraw/index.css"

interface ExcalidrawCanvasProps {
  initialData: {
    elements: readonly unknown[]
    appState: unknown
    files: Record<string, unknown>
  }
  onChange?: (
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => void
}

export function ExcalidrawCanvas({
  initialData,
  onChange,
}: ExcalidrawCanvasProps) {
  const [Excalidraw, setExcalidraw] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null)

  useEffect(() => {
    import("@excalidraw/excalidraw").then((module) => {
      setExcalidraw(
        () => module.Excalidraw as ComponentType<Record<string, unknown>>,
      )
    })
  }, [])

  const handleChange = (
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => {
    onChange?.(elements, appState, files)
  }

  if (!Excalidraw) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading canvas...</div>
      </div>
    )
  }

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            loadScene: false,
          },
        }}
      />
    </div>
  )
}
