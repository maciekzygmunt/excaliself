import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Cloud, Loader2 } from "lucide-react"
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

type ExcalidrawBinaryFile = {
  mimeType?: string
  dataURL?: string
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
  loader: async ({ params }) => {
    const drawing = await getDrawingWithFiles({ data: params.id })
    if (!drawing) {
      throw redirect({ to: "/" })
    }

    return { drawing }
  },
  component: DrawingCanvas,
})

type SceneData = {
  elements: readonly unknown[]
  appState: unknown
  files: Record<string, unknown>
}

function DrawingCanvas() {
  const { drawing } = Route.useLoaderData()
  const { id } = Route.useParams()
  const router = useRouter()

  // Track local edits only - use prop directly for display when not editing
  const [editingName, setEditingName] = useState<string | null>(null)
  const displayName = editingName ?? drawing.name

  const onSave = useCallback(
    async (scene: SceneData) => {
      const fileArray = Object.entries(scene.files || {}).map(
        ([fileId, file]) => {
          const fileData = file as ExcalidrawBinaryFile
          return {
            fileId,
            mimeType: fileData.mimeType || "image/png",
            dataUrl: fileData.dataURL || "",
          }
        },
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
    initialData: drawing.data,
    onSave,
    serialize,
  })

  const handleSceneChange = useCallback(
    (
      elements: readonly unknown[],
      appState: unknown,
      files: Record<string, unknown>,
    ) => {
      handleChange({ elements, appState, files })
    },
    [handleChange],
  )

  const handleNameBlur = async (newName: string) => {
    setEditingName(null)
    if (newName !== drawing.name) {
      await saveDrawing({ data: { id, name: newName } })
      router.invalidate()
    }
  }

  const sceneData = useMemo(() => {
    try {
      const parsed = JSON.parse(drawing.data)
      const appState =
        parsed.appState && typeof parsed.appState === "object"
          ? parsed.appState
          : {}
      const normalizedAppState = {
        ...appState,
        collaborators:
          appState.collaborators instanceof Map
            ? appState.collaborators
            : new Map(),
      }
      const filesMap: Record<string, unknown> = {}
      drawing.files?.forEach((file) => {
        filesMap[file.fileId] = {
          id: file.fileId,
          mimeType: file.mimeType,
          dataURL: file.dataUrl,
        }
      })
      return {
        elements: parsed.elements || [],
        appState: normalizedAppState,
        files: filesMap,
      }
    } catch {
      return {
        elements: [],
        appState: { collaborators: new Map() },
        files: {},
      }
    }
  }, [drawing.data, drawing.files])

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
