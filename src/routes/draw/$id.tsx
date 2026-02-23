import { Excalidraw, MainMenu, serializeAsJSON } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  UIAppState,
} from "@excalidraw/excalidraw/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Cloud, Loader2, PanelLeftIcon, Pencil } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { useAutoSave } from "@/hooks/use-auto-save"
import { queryKeys } from "@/lib/query-keys"
import {
  getDrawingWithFiles,
  saveDrawingScene,
  updateDrawing,
} from "@/server/drawings"
import { TopLeftControls, TopLeftPortal } from "./-components/TopLeftControls"
import {
  buildInitialSceneData,
  getSceneSignature,
  type SceneData,
  toPersistedFiles,
} from "./-utils/scene"

import "@excalidraw/excalidraw/index.css"

export const Route = createFileRoute("/draw/$id")({
  ssr: false,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: queryKeys.drawing(params.id),
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
    queryKey: queryKeys.drawing(id),
    queryFn: () => getDrawingWithFiles({ data: id }),
  })

  const invalidateDrawingQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.drawings() })
    queryClient.invalidateQueries({ queryKey: queryKeys.drawing(id) })
  }, [id, queryClient])

  const saveSceneMutation = useMutation({
    mutationFn: saveDrawingScene,
    onSettled: invalidateDrawingQueries,
  })

  const renameDrawingMutation = useMutation({
    mutationFn: updateDrawing,
    onMutate: async ({ data: { id: drawingId, updateData } }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.drawing(drawingId),
      })
      const previous = queryClient.getQueryData(queryKeys.drawing(drawingId))
      queryClient.setQueryData(
        queryKeys.drawing(drawingId),
        (old: typeof drawing) => (old ? { ...old, ...updateData } : old),
      )
      return { previous }
    },
    onError: (_err, { data: { id: drawingId } }, context) => {
      queryClient.setQueryData(queryKeys.drawing(drawingId), context?.previous)
    },
    onSettled: invalidateDrawingQueries,
  })

  // Track local edits only - use prop directly for display when not editing
  const [editingName, setEditingName] = useState<string | null>(null)
  const displayName = editingName ?? drawing?.name ?? ""

  const onSave = async (scene: SceneData) => {
    await saveSceneMutation.mutateAsync({
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
      renameDrawingMutation.mutate({
        data: {
          id,
          updateData: { name: newName },
        },
      })
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

  const sceneData = useMemo(() => buildInitialSceneData(drawing), [drawing])

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
        <MainMenu>
          <MainMenu.Item
            icon={<PanelLeftIcon className="h-4 w-4" />}
            onSelect={toggleSidebar}
          >
            Drawings
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.Group title="Excalidraw links">
            <MainMenu.DefaultItems.Socials />
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
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
