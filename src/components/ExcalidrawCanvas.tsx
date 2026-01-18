"use client"

import type { ComponentType } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import "@excalidraw/excalidraw/index.css"

type ExcalidrawScene = {
  elements: readonly unknown[]
  appState: unknown
  files: Record<string, unknown>
}

type ExcalidrawApi = {
  updateScene: (scene: ExcalidrawScene) => void
}

interface ExcalidrawCanvasProps {
  initialData: ExcalidrawScene
  scene?: ExcalidrawScene
  onChange?: (
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => void
}

export function ExcalidrawCanvas({
  initialData,
  scene,
  onChange,
}: ExcalidrawCanvasProps) {
  const [Excalidraw, setExcalidraw] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null)
  const apiRef = useRef<ExcalidrawApi | null>(null)
  const sceneRef = useRef<ExcalidrawScene | null>(null)

  useEffect(() => {
    import("@excalidraw/excalidraw").then((module) => {
      setExcalidraw(
        () => module.Excalidraw as ComponentType<Record<string, unknown>>,
      )
    })
  }, [])

  useEffect(() => {
    if (!scene) return
    sceneRef.current = scene
    const api = apiRef.current
    if (api) {
      api.updateScene(scene)
    }
  }, [scene])

  const handleApi = useCallback((api: unknown) => {
    apiRef.current = api as ExcalidrawApi
    if (sceneRef.current) {
      apiRef.current.updateScene(sceneRef.current)
    }
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
        excalidrawAPI={handleApi}
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
