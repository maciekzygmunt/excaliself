import { restore } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Cloud, Loader2, Pencil } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { ExcalidrawCanvas } from "@/components/ExcalidrawCanvas"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAutoSave } from "@/hooks/use-auto-save"
import { authMiddleware } from "@/middleware/auth"
import {
  getDrawingWithFiles,
  updateDrawing,
  updateDrawingFiles,
} from "@/server/drawings"

type SceneData = {
  elements: readonly ExcalidrawElement[]
  appState: AppState
  files: BinaryFiles
}

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

  const onSave = useCallback(
    async (scene: SceneData) => {
      const fileArray = Object.entries(scene.files || {}).map(
        ([fileId, file]) => ({
          fileId,
          mimeType: file.mimeType || "image/png",
          dataUrl: file.dataURL || "",
        }),
      )

      await saveDrawing({
        data: {
          id,
          data: JSON.stringify({
            elements: scene.elements,
            appState: scene.appState,
          }),
          files: fileArray,
        },
      })
    },
    [id],
  )

  const serialize = useCallback(
    (scene: SceneData) =>
      JSON.stringify({ elements: scene.elements, appState: scene.appState }),
    [],
  )

  const { saving, saved, handleChange } = useAutoSave<SceneData>({
    initialData: drawing?.data ?? "{}",
    onSave,
    serialize,
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

  const sceneData: ExcalidrawInitialDataState = useMemo(() => {
    if (!drawing) return restore(null, null, null)
    try {
      const parsed = JSON.parse(drawing.data)
      const files = {} as BinaryFiles
      drawing.files?.forEach((file) => {
        files[file.fileId] = {
          id: file.fileId,
          mimeType: file.mimeType,
          dataURL: file.dataUrl,
        } as BinaryFiles[string]
      })
      const restored = restore(
        {
          elements: parsed.elements,
          appState: parsed.appState,
          files,
        },
        null,
        null,
      )
      restored.appState.collaborators = new Map()
      return restored
    } catch {
      return restore(null, null, null)
    }
  }, [drawing])

  if (!drawing) return null

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-border/40 bg-background px-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="-ml-2 h-9 w-9 text-muted-foreground hover:text-foreground" />
          <div className="h-4 w-px bg-border/60" />
          <Input
            value={displayName}
            onChange={(event) => setEditingName(event.target.value)}
            onBlur={(event) => handleNameBlur(event.target.value)}
            className="h-9 w-[300px] border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            placeholder="Untitled Drawing"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 text-muted-foreground">
            {saving && (
              <div className="flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {saved && !saving && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cloud className="h-3.5 w-3.5" />
                <span>Saved</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ExcalidrawCanvas
          initialData={sceneData}
          scene={sceneData}
          onChange={handleSceneChange}
        />
      </div>
    </div>
  )
}
