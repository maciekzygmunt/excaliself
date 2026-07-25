import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { useQuery } from "@tanstack/react-query"
import { PanelLeftIcon, Share2Icon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  FooterRightPortal,
  TopLeftPortal,
} from "@/components/excalidraw-portal"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { useRoom } from "@/features/collab/use-room"
import { useRenameDrawing } from "@/features/drawings/mutations"
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

/** The green "sharing is on" dot shown beside the Share label. */
const SharingDot = () => (
  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
)

// The Share entry point adapts to the canvas area's width (the @container/
// canvas wrapper below), not the viewport — the app sidebar can eat 240px,
// and Excalidraw's own mobile flip keys off its container too. Both
// surfaces share the 64rem seam, so exactly one of them is ever visible:
//   ≥72rem  labeled island button
//   64–72rem  icon-only island button
//   <64rem  no island button; Share lives in the burger menu instead
// The seams carry real margin: the top row must hold the burger island,
// the toggle+title island (title capped at max-w-45), Excalidraw's full
// ~550px toolbar, our button, and the Library button — worst case ~1000px
// icon-only and ~1060px labeled before anything may clip.
const SHARE_BUTTON_CLASS =
  "gap-1.5 @max-5xl/canvas:hidden @max-6xl/canvas:px-2.5"
const SHARE_LABEL_CLASS = "@max-6xl/canvas:hidden"
// The ! is load-order armor: Excalidraw's lazy-loaded stylesheet declares
// .dropdown-menu-item { display: flex } after our sheet, which would win
// the tie against a plain `hidden`.
const SHARE_MENU_ITEM_CLASS = "@5xl/canvas:hidden!"

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
  const renameMutation = useRenameDrawing()
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  // Share state drives the button's green "sharing is on" dot. Trashed
  // drawings hide the share surface entirely — their link is dead while in
  // the trash and comes back on restore (spec §4.3).
  const [shareOpen, setShareOpen] = useState(false)
  const { data: share } = useQuery({
    ...drawingShareQueryOptions(drawingId),
    enabled: !readOnly,
  })

  // The cap is 25, so this is a corner the owner should almost never see —
  // but while it lasts they are genuinely offline: the room refused them and
  // the server refuses classic writes for a shared drawing, so saying so is
  // the only honest thing to do.
  const handleRoomFull = useCallback(() => {
    toast.error("This drawing has too many people in it right now", {
      id: `room-full:${drawingId}`,
      description: "Your changes won't be saved until someone leaves.",
    })
  }, [drawingId])

  /**
   * Shared ⇒ always collab mode (spec §1.1, §5.5). The owner's own tabs join
   * the socket like any visitor, which is what makes "the room is the only
   * writer" true: with a solo writer still running, two tabs of the owner's
   * would fight the room over the same drawing.
   *
   * No name is sent — the server takes a member's name from their session and
   * ignores whatever the wire claims, so there is nothing for this tab to say.
   */
  const room = useRoom({
    token: readOnly ? null : (share?.token ?? null),
    name: "",
    excalidrawAPI,
    onRoomFull: handleRoomFull,
  })
  // `undefined` is "the share query hasn't answered yet", and autosave stays
  // live through that window: the server refuses the write if the drawing
  // turns out to be shared, and that refusal is what flips this tab into
  // collab mode (see `useSaveScenePayload`).
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
    //
    // While the drawing is shared, classic autosave is suspended and the room
    // persists instead (spec §5.5). Changes keep being *recorded* though —
    // `handleChange` still runs — so when sharing stops the hook picks up
    // exactly where the session left off and saves the collaborative result.
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
      // A no-op until the socket is up and SCENE_INIT has landed, so it costs
      // an unshared drawing one call per change and nothing else.
      roomChange(elements)
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
    <div className="@container/canvas size-full">
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
        // The owner is a participant like anyone else: their cursor goes out
        // and their viewport is relayed to whoever is following them. Both are
        // inert while the socket is closed.
        onPointerUpdate={readOnly ? undefined : room.onPointerUpdate}
        onScrollChange={readOnly ? undefined : room.onScrollChange}
        renderTopRightUI={
          readOnly
            ? undefined
            : () => (
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
