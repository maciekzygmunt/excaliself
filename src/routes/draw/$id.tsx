import { restore } from "@excalidraw/excalidraw"
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
import { Cloud, Loader2, PanelLeftIcon, Pencil } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ExcalidrawCanvas } from "@/components/ExcalidrawCanvas"
import { useSidebar } from "@/components/ui/sidebar"
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
  const [topLeftTarget, setTopLeftTarget] = useState<HTMLElement | null>(null)
  const topLeftTargetRef = useRef<HTMLElement | null>(null)
  const topLeftLayoutClasses = useMemo(
    () => ["flex", "items-center", "gap-[10px]", "flex-nowrap"],
    [],
  )

  useEffect(() => {
    let rafId = 0

    const resolveTarget = () => {
      const container = document.querySelector(
        ".excalidraw .App-menu_top__left",
      )
      if (!(container instanceof HTMLElement)) return null
      const children = Array.from(container.children)
      const target =
        children.find(
          (child) =>
            child instanceof HTMLElement &&
            child.querySelector(".main-menu-trigger"),
        ) ?? null
      if (target instanceof HTMLElement && target.isConnected) {
        return target
      }
      return null
    }

    const applyTargetClasses = (target: HTMLElement | null) => {
      if (!target) return
      target.classList.add(...topLeftLayoutClasses)
    }

    const removeTargetClasses = (target: HTMLElement | null) => {
      if (!target) return
      target.classList.remove(...topLeftLayoutClasses)
    }

    const updateTarget = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const nextTarget = resolveTarget()
        if (topLeftTargetRef.current !== nextTarget) {
          removeTargetClasses(topLeftTargetRef.current)
          applyTargetClasses(nextTarget)
          topLeftTargetRef.current = nextTarget
        }
        setTopLeftTarget(nextTarget)
      })
    }

    updateTarget()

    const handleResize = () => updateTarget()
    window.addEventListener("resize", handleResize)

    const observer = new MutationObserver(() => {
      updateTarget()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener("resize", handleResize)
      observer.disconnect()
      removeTargetClasses(topLeftTargetRef.current)
      topLeftTargetRef.current = null
    }
  }, [topLeftLayoutClasses])

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

  const topLeftControls = (
    <div className="pointer-events-auto flex flex-nowrap items-center gap-[10px]">
      <button
        type="button"
        onClick={toggleSidebar}
        className="dropdown-menu-button [--button-bg:var(--color-surface-low)] [--button-width:var(--lg-button-size)] [--button-height:var(--lg-button-size)] shadow-[0_0_0_1px_var(--color-surface-lowest)] active:shadow-[0_0_0_1px_var(--color-brand-active)]"
        aria-label="Toggle Sidebar"
        title="Toggle Sidebar"
      >
        <PanelLeftIcon className="h-(--lg-icon-size) w-(--lg-icon-size)" />
      </button>
      <div className="relative max-w-[180px] min-w-0 overflow-hidden hidden lg:block">
        <div
          className="relative h-(--lg-button-size) border-b border-transparent bg-transparent font-semibold after:block after:w-full after:min-w-16 after:whitespace-pre after:invisible after:content-[attr(data-value)] focus-within:border-(--color-primary)"
          data-value={displayName || "Untitled Drawing"}
        >
          <input
            value={displayName}
            onChange={(event) => setEditingName(event.target.value)}
            onBlur={(event) => handleNameBlur(event.target.value)}
            className="absolute inset-0 h-full w-full truncate bg-transparent p-0 text-[0.95rem] font-semibold text-(--text-primary-color) shadow-none outline-none focus:cursor-text focus:ring-0 hover:text-(--color-primary)"
            placeholder="Untitled Drawing"
            title="Click to rename scene"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full">
      <ExcalidrawCanvas
        initialData={sceneData}
        scene={sceneData}
        onChange={handleSceneChange}
        renderTopRightUI={renderTopRightUI}
      >
        {topLeftTarget ? createPortal(topLeftControls, topLeftTarget) : null}
      </ExcalidrawCanvas>
    </div>
  )
}
