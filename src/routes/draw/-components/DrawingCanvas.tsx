import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  UIAppState,
} from "@excalidraw/excalidraw/types"
import { Cloud, Loader2, PanelLeftIcon } from "lucide-react"
import { useCallback } from "react"
import { toast } from "sonner"
import { useSidebar } from "@/components/ui/sidebar"
import { useRenameDrawing } from "@/features/drawings/mutations"
import {
  getSceneSignature,
  type SceneData,
  useDrawingScene,
  useSaveScene,
} from "@/features/drawings/scene"
import { useAutoSave } from "@/hooks/use-auto-save"
import { TopLeftControls, TopLeftPortal } from "./TopLeftControls"

import "@excalidraw/excalidraw/index.css"

type Props = {
  drawingId: string
}

export function DrawingCanvas({ drawingId }: Props) {
  const { toggleSidebar } = useSidebar()

  const { drawing, initialData } = useDrawingScene(drawingId)
  const saveSceneMutation = useSaveScene(drawingId)
  const renameMutation = useRenameDrawing()

  const onSave = useCallback(
    (scene: SceneData) => saveSceneMutation.mutateAsync(scene),
    [saveSceneMutation],
  )

  const { saving, saved, handleChange } = useAutoSave<SceneData>({
    onSave,
    getSignature: getSceneSignature,
    skipInitialChange: true,
    onError: () => {
      toast.error("Failed to save drawing", { id: "drawing-save-error" })
    },
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

  const handleNameSubmit = (newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === drawing?.name) return
    renameMutation.mutate({
      data: { id: drawingId, updateData: { name: trimmed } },
    })
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

  if (!drawing || !initialData) return null

  return (
    <div className="size-full">
      <Excalidraw
        initialData={initialData}
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
            // `key` resets the uncontrolled input when the cached drawing name
            // changes from outside (e.g., rename triggered in the sidebar).
            key={drawing.name}
            initialName={drawing.name}
            onToggleSidebar={toggleSidebar}
            onSubmit={handleNameSubmit}
          />
        </TopLeftPortal>
      </Excalidraw>
    </div>
  )
}

export default DrawingCanvas
