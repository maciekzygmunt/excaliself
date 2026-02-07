import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Cloud, Loader2, Pencil } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { useAutoSave } from "@/hooks/use-auto-save"
import { authMiddleware } from "@/middleware/auth"
import {
  getDrawingWithFiles,
  updateDrawing,
  updateDrawingFiles,
} from "@/server/drawings"
import { TopLeftControls, TopLeftPortal } from "./-components/TopLeftControls"
import {
  getSceneSignature,
  restoreScene,
  type SceneData,
  toPersistedFiles,
} from "./-utils/scene"

import "@excalidraw/excalidraw/index.css"

const saveDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    (data: {
      id: string
      name?: string
      data?: string
      thumbnail?: string
      files?: { fileId: string; mimeType: string; dataUrl: string }[]
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, files, ...updateData } = data
    await updateDrawing({
      data: {
        id,
        updateData,
      },
    })

    if (files) {
      await updateDrawingFiles({
        data: {
          drawingId: id,
          files,
        },
      })
    }
  })

export const Route = createFileRoute("/draw/$id")({
  ssr: false,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["drawing", params.id],
      queryFn: () => getDrawingWithFiles({ data: params.id }),
    })
  },
  component: DrawingCanvas,
  pendingComponent: () => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Pencil className="h-8 w-8 animate-pulse" />
      <span className="text-sm">Loading drawing...</span>
    </div>
  ),
})

function DrawingCanvas() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const { toggleSidebar } = useSidebar()

  const { data: drawing } = useQuery({
    queryKey: ["drawing", id],
    queryFn: () => getDrawingWithFiles({ data: id }),
  })

  const saveDrawingMutation = useMutation({
    mutationFn: saveDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
      queryClient.invalidateQueries({ queryKey: ["drawing", id] })
    },
  })

  // Track local edits only - use prop directly for display when not editing
  const [editingName, setEditingName] = useState<string | null>(null)
  const displayName = editingName ?? drawing?.name ?? ""

  const onSave = async (scene: SceneData) => {
    await saveDrawingMutation.mutateAsync({
      data: {
        id,
        data: serializeAsJSON(
          scene.elements,
          scene.appState,
          scene.files ?? {},
          "database",
        ),
        files: toPersistedFiles(scene.files ?? {}),
      },
    })
  }

  const { saving, saved, handleChange } = useAutoSave<SceneData>({
    onSave,
    getSignature: getSceneSignature,
    resetKey: id,
    skipInitialChange: true,
  })

  const handleSceneChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      handleChange({ elements, appState, files })
    },
    [handleChange],
  )

  const handleNameBlur = (newName: string) => {
    setEditingName(null)
    if (newName !== drawing?.name) {
      saveDrawingMutation.mutate({ data: { id, name: newName } })
    }
  }

  const renderTopRightUI = useCallback(
    (_isMobile: boolean, _appState: UIAppState) => {
      if (!saving && !saved) return null
      return (
        <div className="pointer-events-auto absolute bottom-(--editor-container-padding) right-(--editor-container-padding) z-(--zIndex-layerUI) flex items-center gap-1.5 rounded-(--border-radius-lg) bg-(--island-bg-color) px-2 py-1 text-xs font-(--ui-font) text-(--text-primary-color) shadow-(--shadow-island)">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Cloud className="h-3.5 w-3.5" />
              <span>Saved</span>
            </>
          )}
        </div>
      )
    },
    [saving, saved],
  )

  const sceneData: ExcalidrawInitialDataState = useMemo(
    () => restoreScene(drawing),
    [drawing],
  )

  if (!drawing) return null

  return (
    <div className="size-full">
      <Excalidraw
        key={id}
        initialData={sceneData}
        onChange={handleSceneChange}
        renderTopRightUI={renderTopRightUI}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        <TopLeftPortal>
          <TopLeftControls
            displayName={displayName}
            onToggleSidebar={toggleSidebar}
            onNameChange={setEditingName}
            onNameBlur={handleNameBlur}
          />
        </TopLeftPortal>
      </Excalidraw>
    </div>
  )
}
