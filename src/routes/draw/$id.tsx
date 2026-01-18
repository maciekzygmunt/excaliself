import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { ArrowLeft, Check } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExcalidrawCanvas } from "@/components/ExcalidrawCanvas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authMiddleware } from "@/middleware/auth"
import {
  getDrawingWithFiles,
  updateDrawing,
  updateDrawingFiles,
} from "@/server/drawings"
import { isSetupComplete } from "@/server/users"

type ExcalidrawBinaryFile = {
  mimeType?: string
  dataURL?: string
}

const getSession = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    })
    return session
  },
)

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
  beforeLoad: async () => {
    const setupComplete = await isSetupComplete()
    if (!setupComplete) {
      throw redirect({ to: "/setup" })
    }

    const session = await getSession()
    if (!session?.user) {
      throw redirect({ to: "/login" })
    }
  },
  loader: async ({ params }) => {
    const drawing = await getDrawingWithFiles({
      data: params.id,
    })
    if (!drawing) {
      throw redirect({ to: "/" })
    }
    return { drawing }
  },
  component: DrawingEditorPage,
})

function DrawingEditorPage() {
  const { drawing } = Route.useLoaderData()
  const { id } = Route.useParams()

  const [name, setName] = useState(drawing.name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedDataRef = useRef<string>(drawing.data)
  const latestSceneRef = useRef<{
    elements: readonly unknown[]
    appState: unknown
    files: Record<string, unknown>
  } | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    setName(drawing.name)
    lastSavedDataRef.current = drawing.data
  }, [drawing.data, drawing.name])

  const handleSave = useCallback(
    async (
      elements: readonly unknown[],
      appState: unknown,
      files: Record<string, unknown>,
      updateUi: boolean = true,
    ) => {
      const dataString = JSON.stringify({ elements, appState })

      if (dataString === lastSavedDataRef.current) {
        return
      }

      if (updateUi && isMountedRef.current) {
        setSaving(true)
      }

      const fileArray = Object.entries(files || {}).map(([fileId, file]) => {
        const fileData = file as ExcalidrawBinaryFile
        return {
          fileId,
          mimeType: fileData.mimeType || "image/png",
          dataUrl: fileData.dataURL || "",
        }
      })

      try {
        await saveDrawing({
          data: {
            id,
            data: dataString,
            files: fileArray,
          },
        })

        lastSavedDataRef.current = dataString
        if (updateUi && isMountedRef.current) {
          setSaved(true)
          if (savedTimeoutRef.current) {
            clearTimeout(savedTimeoutRef.current)
          }
          savedTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setSaved(false)
            }
          }, 2000)
        }
      } catch (err) {
        console.error("Failed to save:", err)
      } finally {
        if (updateUi && isMountedRef.current) {
          setSaving(false)
        }
      }
    },
    [id],
  )

  const handleDebouncedSave = useCallback(
    (
      elements: readonly unknown[],
      appState: unknown,
      files: Record<string, unknown>,
    ) => {
      latestSceneRef.current = { elements, appState, files }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(() => {
        void handleSave(elements, appState, files)
      }, 300)
    },
    [handleSave],
  )

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
        savedTimeoutRef.current = null
      }
      const latest = latestSceneRef.current
      if (latest) {
        void handleSave(latest.elements, latest.appState, latest.files, false)
      }
    }
  }, [handleSave])

  const handleNameChange = async (newName: string) => {
    setName(newName)
    await saveDrawing({ data: { id, name: newName } })
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
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => handleNameChange(e.target.value)}
            className="h-8 w-64 border-transparent bg-transparent hover:border-input focus:border-input"
          />
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-sm text-muted-foreground">Saving...</span>
          )}
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </header>
      <div className="flex-1">
        <ExcalidrawCanvas
          initialData={sceneData}
          scene={sceneData}
          onChange={handleDebouncedSave}
        />
      </div>
    </div>
  )
}
