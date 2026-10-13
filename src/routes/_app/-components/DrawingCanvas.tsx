import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PanelLeftIcon, Share2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  FooterRightPortal,
  TopLeftPortal,
} from "@/components/excalidraw-portal"
import { FollowModeOverlay } from "@/components/follow-mode-overlay"
import { MenuParticipants } from "@/components/menu-participants"
import { MenuReconnecting } from "@/components/menu-reconnecting"
import { PresenceAvatars } from "@/components/presence-avatars"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { useRoom } from "@/features/collab/use-room"
import { useRenameDrawing } from "@/features/drawings/mutations"
import { drawingQueryOptions } from "@/features/drawings/queries"
import {
  buildScenePayload,
  getScenePayloadSignature,
  useDrawingScene,
  useSaveScenePayload,
} from "@/features/drawings/scene"
import { drawingShareQueryOptions } from "@/features/shares/queries"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useCanvasTheme } from "@/hooks/use-theme"
import { SaveStatusPill } from "./SaveStatusPill"
import { ShareDialog } from "./ShareDialog"
import { TopLeftControls } from "./TopLeftControls"

import "@excalidraw/excalidraw/index.css"

const SharingDot = () => (
  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
)

// Breakpoints key off the canvas container, not the viewport (the sidebar eats
// 240px). ≥72rem labeled, 64–72rem icon-only, <64rem Share moves to the menu.
const SHARE_BUTTON_CLASS =
  "gap-1.5 @max-5xl/canvas:hidden @max-6xl/canvas:px-2.5"
const SHARE_LABEL_CLASS = "@max-6xl/canvas:hidden"
// `!` beats Excalidraw's later-loaded `.dropdown-menu-item { display: flex }`.
const SHARE_MENU_ITEM_CLASS = "@5xl/canvas:hidden!"
const PRESENCE_CLASS = "@max-[76rem]/canvas:hidden"
const PRESENCE_MENU_ROW_CLASS = "@min-[76rem]/canvas:hidden!"

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
  const canvasTheme = useCanvasTheme()

  const { drawing, initialData, isDataCorrupt } = useDrawingScene(drawingId)
  const saveScenePayload = useSaveScenePayload(drawingId)
  // `useRoom` needs a stable reference.
  const storedFileIds = useMemo(
    () => (drawing?.files ?? []).map((file) => file.fileId),
    [drawing?.files],
  )
  const renameMutation = useRenameDrawing()
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const { data: share } = useQuery({
    ...drawingShareQueryOptions(drawingId),
    enabled: !readOnly,
  })

  // Only a first join hits this (rejoins retry), so nothing recovers on its
  // own: the tab is offline until reload.
  const handleRoomFull = useCallback(() => {
    toast.error("This drawing has too many people in it right now", {
      id: `room-full:${drawingId}`,
      duration: Number.POSITIVE_INFINITY,
      description:
        "Your changes aren't being saved. Reload the page to try joining again.",
    })
  }, [drawingId])

  // Link stopped, regenerated, or drawing trashed. Trash keeps the share row,
  // so only re-reading the drawing flips this tab to read-only.
  const queryClient = useQueryClient()
  const handleLinkDead = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: drawingShareQueryOptions(drawingId).queryKey,
    })
    void queryClient.invalidateQueries({
      queryKey: drawingQueryOptions(drawingId).queryKey,
    })
  }, [queryClient, drawingId])

  // A shared drawing has one writer, the room, so the owner's tabs join it too.
  const room = useRoom({
    token: readOnly ? null : (share?.token ?? null),
    // Members use their session name.
    name: null,
    excalidrawAPI,
    onRoomFull: handleRoomFull,
    onLinkDead: handleLinkDead,
    storedFileIds,
  })
  // Autosave stays live until the share query answers; the server refuses the
  // write if the drawing is shared.
  const isShared = share != null && !readOnly

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

  const {
    saving,
    saved,
    handleChange,
    flush: flushAutoSave,
  } = useAutoSave({
    toPayload: buildScenePayload,
    getSignature: getScenePayloadSignature,
    onSave: saveScenePayload,
    scopeId: `save-drawing:${drawingId}`,
    skipInitialChange: true,
    // `readOnly` also unwires onChange below; pausing here is belt and
    // braces so no code path can flush a save for a trashed drawing.
    // While shared the room saves; changes are still recorded for when it stops.
    paused: autoSavePaused || readOnly || isShared,
    onError: () => {
      toast.error("Failed to save drawing", { id: "drawing-save-error" })
    },
  })

  const roomChange = room.onChange
  const handleSceneChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      handleChange({ elements, appState, files })
      // No-op until the room is joined.
      roomChange(elements, appState, files)
    },
    [handleChange, roomChange],
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
    <div className="@container/canvas relative size-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawAPI}
        // Controlled: the canvas renders in the app theme, and a theme baked
        // into the saved scene state is ignored on load. With the prop set,
        // Excalidraw disables its toggleTheme action, which also retires the
        // Shift+Alt+D shortcut; `toggleTheme: false` pins that down.
        theme={canvasTheme}
        viewModeEnabled={readOnly || undefined}
        onChange={readOnly ? undefined : handleSceneChange}
        onPointerUpdate={readOnly ? undefined : room.onPointerUpdate}
        onScrollChange={readOnly ? undefined : room.onScrollChange}
        renderTopRightUI={
          readOnly
            ? undefined
            : () => (
                <>
                  <PresenceAvatars room={room} className={PRESENCE_CLASS} />
                  <Button
                    onClick={() => setShareOpen(true)}
                    aria-label="Share"
                    title="Share"
                    className={SHARE_BUTTON_CLASS}
                  >
                    <Share2Icon className="h-3.5 w-3.5" />
                    <span className={SHARE_LABEL_CLASS}>Share</span>
                    {share && <SharingDot />}
                  </Button>
                </>
              )
        }
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      >
        <MainMenu>
          <MenuReconnecting
            status={room.connectionStatus}
            className={PRESENCE_MENU_ROW_CLASS}
          />
          <MenuParticipants room={room} className={PRESENCE_MENU_ROW_CLASS} />
          <MainMenu.Item
            icon={<PanelLeftIcon className="h-4 w-4" />}
            onSelect={toggleSidebar}
          >
            Drawings
          </MainMenu.Item>
          {!readOnly && (
            <MainMenu.Item
              className={SHARE_MENU_ITEM_CLASS}
              icon={<Share2Icon className="h-4 w-4" />}
              onSelect={() => setShareOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                Share
                {share != null && <SharingDot />}
              </span>
            </MainMenu.Item>
          )}
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
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        {/* No autosave in read-only mode, so no save status to report. */}
        {!readOnly && (
          <FooterRightPortal>
            <ReconnectingIndicator
              status={room.connectionStatus}
              className="order-first mr-2 h-auto self-stretch"
            />
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
      <FollowModeOverlay room={room} />
      {!readOnly && (
        <ShareDialog
          drawingId={drawingId}
          open={shareOpen}
          onOpenChange={setShareOpen}
          onBeforeCreate={flushAutoSave}
        />
      )}
    </div>
  )
}

export default DrawingCanvas
