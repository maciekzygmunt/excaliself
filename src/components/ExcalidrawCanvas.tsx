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
  const [loadError, setLoadError] = useState<Error | null>(null)
  const apiRef = useRef<ExcalidrawApi | null>(null)
  const sceneRef = useRef<ExcalidrawScene | null>(null)

  useEffect(() => {
    let isActive = true
    import("@excalidraw/excalidraw")
      .then((module) => {
        if (!isActive) return
        setExcalidraw(
          () => module.Excalidraw as ComponentType<Record<string, unknown>>,
        )
      })
      .catch((err: unknown) => {
        if (!isActive) return
        setLoadError(err instanceof Error ? err : new Error(String(err)))
      })
    return () => {
      isActive = false
    }
  }, [])

  const scheduleSceneUpdate = useCallback((sceneToApply: ExcalidrawScene) => {
    // Defer updates until after mount to avoid setState-before-mount warnings.
    requestAnimationFrame(() => {
      const api = apiRef.current
      if (api) {
        api.updateScene(sceneToApply)
      }
    })
  }, [])

  useEffect(() => {
    if (!scene) return
    sceneRef.current = scene
    if (apiRef.current) {
      scheduleSceneUpdate(scene)
    }
  }, [scene, scheduleSceneUpdate])

  const handleApi = useCallback(
    (api: unknown) => {
      apiRef.current = api as ExcalidrawApi
      if (sceneRef.current) {
        scheduleSceneUpdate(sceneRef.current)
      }
    },
    [scheduleSceneUpdate],
  )

  const handleChange = (
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => {
    onChange?.(elements, appState, files)
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red-600">Failed to load canvas.</div>
      </div>
    )
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
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  )
}
