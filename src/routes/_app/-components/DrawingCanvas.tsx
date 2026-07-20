import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import { PanelLeftIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useSidebar } from "@/components/ui/sidebar"
import { useRenameDrawing } from "@/features/drawings/mutations"
import {
  buildScenePayload,
  getScenePayloadSignature,
  useDrawingScene,
  useSaveScenePayload,
} from "@/features/drawings/scene"
import { useAutoSave } from "@/hooks/use-auto-save"
import { FooterRightPortal, SaveStatusPill } from "./SaveStatusPill"
import { TopLeftControls, TopLeftPortal } from "./TopLeftControls"

import "@excalidraw/excalidraw/index.css"

type Props = {
  drawingId: string
  /**
   * Trashed drawings (spec §5.11): Excalidraw view mode, no autosave wiring,
   * no rename. The server refuses writes to trashed drawings regardless —
   * this keeps the client from even trying. The parent remounts the canvas
   * when the flag flips, so it can be treated as fixed for a mount.
   */
  readOnly?: boolean
}

export function DrawingCanvas({ drawingId, readOnly = false }: Props) {
  const { toggleSidebar } = useSidebar()

  const { drawing, initialData, isDataCorrupt } = useDrawingScene(drawingId)
  const saveScenePayload = useSaveScenePayload(drawingId)
  const renameMutation = useRenameDrawing()

  // A corrupt stored scene opens as an empty canvas; pause autosave until the
  // user acknowledges, so the next save doesn't silently overwrite the data.
  // Edits made while paused are recorded and saved once acknowledged.
  const [corruptAcknowledged, setCorruptAcknowledged] = useState(false)
  const autoSavePaused = isDataCorrupt && !corruptAcknowledged

  useEffect(() => {
    // Read-only view: nothing can save, so the "auto-save is paused" toast
    // and its "Edit anyway" escape hatch would only mislead.
    if (readOnly) return
    if (!isDataCorrupt || corruptAcknowledged) return
    const toastId = `corrupt-scene:${drawingId}`
    toast.error("This drawing's saved data couldn't be read", {
      id: toastId,
      duration: Number.POSITIVE_INFINITY,
      description:
        "It opened as an empty canvas. Auto-save is paused so the stored data isn't overwritten.",
      action: {
        label: "Edit anyway",
        onClick: () => setCorruptAcknowledged(true),
      },
    })
    return () => {
      toast.dismiss(toastId)
    }
  }, [isDataCorrupt, corruptAcknowledged, drawingId, readOnly])

  const { saving, saved, handleChange } = useAutoSave({
    toPayload: buildScenePayload,
    getSignature: getScenePayloadSignature,
    onSave: saveScenePayload,
    scopeId: `save-drawing:${drawingId}`,
    skipInitialChange: true,
    // `readOnly` also unwires onChange below; pausing here is belt and
    // braces so no code path can flush a save for a trashed drawing.
    paused: autoSavePaused || readOnly,
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

  if (!drawing || !initialData) return null

  return (
    <div className="size-full">
      <Excalidraw
        initialData={initialData}
        viewModeEnabled={readOnly || undefined}
        onChange={readOnly ? undefined : handleSceneChange}
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
        {/* No autosave in read-only mode, so no save status to report. */}
        {!readOnly && (
          <FooterRightPortal>
            <SaveStatusPill saving={saving} saved={saved} />
          </FooterRightPortal>
        )}
        <TopLeftPortal>
          <TopLeftControls
            // `key` resets the uncontrolled input when the cached drawing name
            // changes from outside (e.g., rename triggered in the sidebar).
            key={drawing.name}
            initialName={drawing.name}
            readOnly={readOnly}
            onToggleSidebar={toggleSidebar}
            onSubmit={handleNameSubmit}
          />
        </TopLeftPortal>
      </Excalidraw>
    </div>
  )
}

export default DrawingCanvas
