import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Check, Cloud, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExcalidrawCanvas } from "@/components/ExcalidrawCanvas"
import { Input } from "@/components/ui/input"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { authMiddleware } from "@/middleware/auth"
import {
  getDrawingWithFiles,
  updateDrawing,
  updateDrawingFiles,
} from "@/server/drawings"
import { getFolders } from "@/server/folders"

type DrawingWithFiles = NonNullable<
  Awaited<ReturnType<typeof getDrawingWithFiles>>
>

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
    const [drawing, folders] = await Promise.all([
      getDrawingWithFiles({ data: params.id }),
      getFolders(),
    ])

    if (!drawing) {
      throw redirect({ to: "/" })
    }

    return { drawing, folders }
  },
  component: DrawingCanvas,
})

function DrawingCanvas() {
  const { drawing, folders } = Route.useLoaderData()
  const { id } = Route.useParams()
  const { open } = useSidebar()

  const [name, setName] = useState(drawing.name)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    drawing.folderId ?? null,
  )
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
    setCurrentFolderId(drawing.folderId ?? null)
    lastSavedDataRef.current = drawing.data
  }, [drawing.data, drawing.folderId, drawing.name])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  const handleFolderChange = async (value: string) => {
    const folderId = value === "" ? null : value
    setCurrentFolderId(folderId)
    await updateDrawing({ data: { id, updateData: { folderId } } })
  }

  const folderChildren = useMemo(() => {
    const map = new Map<string | null, typeof folders>()
    for (const folder of folders) {
      const parentId = folder.parentId ?? null
      if (!map.has(parentId)) {
        map.set(parentId, [])
      }
      map.get(parentId)?.push(folder)
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [folders])

  const folderOptions = useMemo(() => {
    const options: { id: string | null; label: string }[] = []
    const walk = (parentId: string | null, depth: number) => {
      const children = folderChildren.get(parentId) ?? []
      for (const folder of children) {
        options.push({
          id: folder.id,
          label: `${"- ".repeat(depth)}${folder.name}`,
        })
        walk(folder.id, depth + 1)
      }
    }
    walk(null, 0)
    return options
  }, [folderChildren])

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
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => handleNameChange(event.target.value)}
            className="h-9 w-[300px] border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
            placeholder="Untitled Drawing"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={currentFolderId ?? ""}
              onChange={(event) => void handleFolderChange(event.target.value)}
              className="h-8 appearance-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No folder</option>
              {folderOptions.map((option) => (
                <option key={option.id ?? "root"} value={option.id ?? ""}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
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
          onChange={handleDebouncedSave}
        />
      </div>
    </div>
  )
}
