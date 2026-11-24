import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  MessageSquareIcon,
  PanelLeftIcon,
  Share2Icon,
  Users,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { toast } from "sonner"
import { FooterRightPortal } from "@/components/excalidraw-portal"
import { useFollowStatusFrame } from "@/components/follow-status-frame"
import { MenuParticipants } from "@/components/menu-participants"
import { MenuReconnecting } from "@/components/menu-reconnecting"
import { PresenceAvatars } from "@/components/presence-avatars"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { currentUserQueryOptions } from "@/features/account/queries"
import { useRefreshLiveOnRoster } from "@/features/collab/queries"
import {
  roomPathForDrawing,
  roomPathForToken,
} from "@/features/collab/room-url"
import { useRoom } from "@/features/collab/use-room"
import {
  markImageStatus,
  toastImageCapFull,
  toastImageTooLarge,
} from "@/features/collab/use-room-files"
import { useRenameDrawing } from "@/features/drawings/mutations"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import {
  buildScenePayload,
  getScenePayloadSignature,
  type ScenePayload,
  selectOversizedImages,
  useDrawingScene,
  useReloadSceneAfterRoom,
  useSaveScenePayload,
} from "@/features/drawings/scene"
import { useDrawingViewport } from "@/features/drawings/use-drawing-viewport"
import { useTeamLibrary } from "@/features/library/use-team-library"
import { supportsDeviceDrawings } from "@/features/offline/store"
import { forgetDeviceDrawingWhenFree } from "@/features/offline/sync"
import { useDeviceCopy } from "@/features/offline/use-device-copy"
import { drawingShareQueryOptions } from "@/features/shares/queries"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useCanvasTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { CommentsButton } from "./comments/CommentsButton"
import { CommentsLayer } from "./comments/CommentsLayer"
import { DrawingEditCard } from "./DrawingEditCard"
import { useMoveToTeamDialog } from "./MoveToTeamDialog"
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
const PRESENCE_CLASS = "@max-[77rem]/canvas:hidden"
const PRESENCE_MENU_ROW_CLASS = "@min-[77rem]/canvas:hidden!"
// On a phone, view mode shows a button to leave it, which a read-only canvas
// can't do.
const READ_ONLY_CLASS = "[&_button.disable-view-mode]:hidden!"

type Props = {
  drawingId: string
  /**
   * Trashed drawings (spec §5.11): Excalidraw view mode, no autosave wiring,
   * no rename. The server refuses writes to trashed drawings regardless —
   * this keeps the client from even trying. The parent remounts the canvas
   * when the flag flips, so it can be treated as fixed for a mount.
   */
  readOnly?: boolean
  /** The Room ended for good; `trashedBy` names the member who trashed it. */
  onLinkDead?: (trashedBy: string | null) => void
}

export function DrawingCanvas({
  drawingId,
  readOnly = false,
  onLinkDead,
}: Props) {
  const { toggleSidebar } = useSidebar()
  const canvasTheme = useCanvasTheme()

  const { drawing, initialData, isDataCorrupt } = useDrawingScene(drawingId)
  const { getInitialData, initialState, observeViewport } = useDrawingViewport(
    drawingId,
    initialData,
  )
  // `useRoom` needs a stable reference.
  const storedFileIds = useMemo(
    () => (drawing?.files ?? []).map((file) => file.fileId),
    [drawing?.files],
  )
  const storedFileIdSet = useMemo(() => new Set(storedFileIds), [storedFileIds])
  const renameMutation = useRenameDrawing()
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  // Private drawings too: the library is the team's, not the space's.
  const handleLibraryChange = useTeamLibrary(excalidrawAPI)

  // Flagged `error` as a room does, so autosave stops sending them.
  const handleImagesOverCap = useCallback(
    (fileIds: string[]) => {
      if (!excalidrawAPI) return
      for (const fileId of fileIds)
        markImageStatus(excalidrawAPI, fileId, "error")
      toastImageCapFull()
    },
    [excalidrawAPI],
  )
  const saveScenePayload = useSaveScenePayload(drawingId, handleImagesOverCap)

  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const toggleComments = useCallback(() => setCommentsOpen((open) => !open), [])
  const { data: share } = useQuery({
    ...drawingShareQueryOptions(drawingId),
    enabled: !readOnly,
  })

  // Only a first join hits this (rejoins retry), so nothing recovers on its
  // own: the tab is offline until reload.
  const handleRoomFull = useCallback(() => {
    toast.error(m.drawing_room_full_title(), {
      id: `room-full:${drawingId}`,
      duration: Number.POSITIVE_INFINITY,
      description: m.drawing_room_full_description(),
    })
  }, [drawingId])

  // The polled list also carries the space, so a tab that missed a move to
  // Team (another tab, another device) flips without waiting for its next
  // save to be refused. Moves are one-way, so either source saying Team wins.
  const { data: listedSpace } = useQuery({
    ...drawingsQueryOptions(),
    select: (drawings) => drawings.find((d) => d.id === drawingId)?.space,
  })
  // A Team drawing is always a Room, joined by id; a Private one only while
  // its Share link exists. Either way the Room is the only writer.
  const isTeam = drawing?.space === "team" || listedSpace === "team"
  const roomPath = readOnly
    ? null
    : isTeam
      ? roomPathForDrawing(drawingId)
      : share
        ? roomPathForToken(share.token)
        : null
  // Keyed on the room, so a later link to a repaired scene starts clean.
  const [unreadableRoom, setUnreadableRoom] = useState<string | null>(null)
  const handleSceneUnreadable = useCallback(
    () => setUnreadableRoom(roomPath),
    [roomPath],
  )
  const sceneUnreadable = roomPath !== null && unreadableRoom === roomPath

  // Link stopped, regenerated, or drawing trashed. Trash keeps the share row,
  // so only re-reading the drawing flips this tab to read-only. If the same
  // Room is still wanted after that, the server refused it; see below.
  const queryClient = useQueryClient()
  const [refusedRoom, setRefusedRoom] = useState<string | null>(null)
  const handleLinkDead = useCallback(
    (trashedBy: string | null) => {
      onLinkDead?.(trashedBy)
      const refused = roomPath
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: drawingShareQueryOptions(drawingId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: drawingQueryOptions(drawingId).queryKey,
        }),
      ]).then(() => setRefusedRoom(refused))
    },
    [queryClient, drawingId, onLinkDead, roomPath],
  )
  const roomRefused = roomPath !== null && refusedRoom === roomPath

  const room = useRoom({
    room: roomPath,
    // Members use their session name.
    name: null,
    excalidrawAPI,
    onRoomFull: handleRoomFull,
    onLinkDead: handleLinkDead,
    onSceneUnreadable: handleSceneUnreadable,
    storedFileIds,
  })
  useRefreshLiveOnRoster(room.others)
  const followStatusFrame = useFollowStatusFrame(room)
  // Autosave stays live until the share query answers; the server refuses the
  // write if the drawing is shared or in Team.
  const isLive = !readOnly && (isTeam || share != null)
  const reloadingScene = useReloadSceneAfterRoom(
    drawingId,
    isLive,
    excalidrawAPI,
  )

  // The room refused this tab though the link still works, so nothing here
  // is saved. A fresh join may pass.
  useEffect(() => {
    if (!roomRefused) return
    const toastId = `room-refused:${drawingId}`
    toast.error(m.drawing_room_refused_title(), {
      id: toastId,
      duration: Number.POSITIVE_INFINITY,
      description: m.drawing_room_refused_description(),
    })
    return () => {
      toast.dismiss(toastId)
    }
  }, [roomRefused, drawingId])

  // The room refused the damaged stored scene, so nothing here is saved.
  useEffect(() => {
    if (!sceneUnreadable) return
    const toastId = `scene-unreadable:${drawingId}`
    toast.error(m.drawing_scene_unreadable_title(), {
      id: toastId,
      duration: Number.POSITIVE_INFINITY,
      description: isTeam
        ? m.drawing_scene_unreadable_team()
        : m.drawing_scene_unreadable_shared(),
    })
    return () => {
      toast.dismiss(toastId)
    }
  }, [sceneUnreadable, drawingId, isTeam])

  // A corrupt stored scene opens as an empty canvas; pause autosave until the
  // user acknowledges, so the next save doesn't silently overwrite the data.
  // Edits made while paused are recorded and saved once acknowledged.
  const [corruptAcknowledged, setCorruptAcknowledged] = useState(false)
  const autoSavePaused = isDataCorrupt && !corruptAcknowledged

  useEffect(() => {
    // Read-only view: nothing can save, so the "auto-save is paused" toast
    // and its "Edit anyway" escape hatch would only mislead.
    if (readOnly) return
    // Live: the room's refusal says it, and "Edit anyway" can't save there.
    // Waiting for the share query keeps this one from flashing first.
    if (isTeam || share !== null) return
    if (!isDataCorrupt || corruptAcknowledged) return
    const toastId = `corrupt-scene:${drawingId}`
    toast.error(m.drawing_corrupt_title(), {
      id: toastId,
      duration: Number.POSITIVE_INFINITY,
      description: m.drawing_corrupt_description(),
      action: {
        label: m.drawing_corrupt_edit_anyway(),
        onClick: () => setCorruptAcknowledged(true),
      },
    })
    return () => {
      toast.dismiss(toastId)
    }
  }, [isDataCorrupt, corruptAcknowledged, drawingId, readOnly, isTeam, share])

  // A solo private drawing is also kept on this device, so it opens offline
  // and a failed save waits there instead of being lost.
  const { data: userId } = useQuery({
    ...currentUserQueryOptions(),
    select: (user) => user.id,
  })
  const device = useDeviceCopy(
    userId,
    drawing,
    supportsDeviceDrawings() &&
      drawing?.space === "private" &&
      share === null &&
      !readOnly &&
      !isLive &&
      !isDataCorrupt &&
      !reloadingScene,
  )
  // Shared or moved to Team: the Room owns it now. Unsent edits stay, and
  // sync as a new drawing.
  useEffect(() => {
    if (isLive && userId && supportsDeviceDrawings())
      // Waits for every editor, here and in other tabs, to let go first.
      void forgetDeviceDrawingWhenFree(userId, drawingId).catch(() => {})
  }, [isLive, userId, drawingId])
  const [waitingToSync, setWaitingToSync] = useState(false)
  // A save failed. Retried once the device copy holds the edits, even if it
  // wasn't ready when the save failed.
  const [saveFailed, setSaveFailed] = useState(false)
  // Set with the state, so a flush that just failed is seen before a render.
  const waitingRef = useRef(false)
  const setWaiting = useCallback((waiting: boolean) => {
    waitingRef.current = waiting
    setWaitingToSync(waiting)
  }, [])
  // Live: the Room saves now, and the unsent edits sync as a new drawing.
  useEffect(() => {
    if (!isLive) return
    setWaiting(false)
    setSaveFailed(false)
  }, [isLive, setWaiting])
  const deviceSaving = device.saving
  const flushDevice = device.flush
  const saveScene = useCallback(
    async (payload: ScenePayload) => {
      const deviceSaved = deviceSaving()
      try {
        const result = await saveScenePayload(payload)
        if (result === "saved") {
          deviceSaved(payload)
          setWaiting(false)
          setSaveFailed(false)
        }
        return result
      } catch (error) {
        // The latest edits are on neither: stop claiming the device has them.
        const kept = await flushDevice()
        setSaveFailed(true)
        setWaiting(kept)
        if (!kept) throw error
        return "skipped" as const
      }
    },
    [saveScenePayload, deviceSaving, flushDevice, setWaiting],
  )

  const {
    saving,
    saved,
    handleChange,
    flush: flushAutoSave,
  } = useAutoSave({
    toPayload: buildScenePayload,
    getSignature: getScenePayloadSignature,
    onSave: saveScene,
    scopeId: `save-drawing:${drawingId}`,
    skipInitialChange: true,
    // `readOnly` also unwires onChange below; pausing here is belt and
    // braces so no code path can flush a save for a trashed drawing.
    // While live the room saves; changes are still recorded for when it
    // stops. After it stops, the stored scene replaces them first.
    paused: autoSavePaused || readOnly || isLive || reloadingScene,
    onError: () => {
      toast.error(m.drawing_save_failed(), { id: "drawing-save-error" })
    },
  })

  // Offline, react-query holds saves until the browser reconnects.
  const online = useSyncExternalStore(
    onlineManager.subscribe.bind(onlineManager),
    () => onlineManager.isOnline(),
    () => true,
  )
  const onDevice = waitingToSync || (!online && device.keeping)

  // Edits kept on the device go up with the next save that gets through.
  const retrying = waitingToSync || (saveFailed && device.keeping)
  useEffect(() => {
    if (!retrying) return
    // Resent even if unchanged: an undo may have returned to the last saved
    // scene, and the failed request may have landed or not.
    const retry = () => void flushAutoSave({ resend: true }).catch(() => {})
    const interval = setInterval(retry, 10_000)
    window.addEventListener("online", retry)
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", retry)
    }
  }, [retrying, flushAutoSave])

  // Rejects while edits only sit on the device, so a share or a move to
  // Team never starts from a stale stored scene.
  const flushToServer = useCallback(async () => {
    await flushAutoSave()
    if (waitingRef.current)
      throw new Error("Changes are saved only on this device")
  }, [flushAutoSave])

  // Any move to Team or Duplicate flushes this canvas first, whichever menu
  // started it: the solo save, and the live Room's image uploads.
  const { requestMoveToTeam, registerFlush } = useMoveToTeamDialog()
  const flushRoomUploads = room.flushUploads
  useEffect(() => {
    if (readOnly) return
    return registerFlush(async () => {
      await Promise.all([flushToServer(), flushRoomUploads()])
    })
  }, [readOnly, registerFlush, flushToServer, flushRoomUploads])

  const roomChange = room.onChange
  const deviceChange = device.onChange
  const following = room.userToFollow !== null
  const handleSceneChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      observeViewport(appState, following)
      if (readOnly) return
      // A room flags these itself, from the upload's answer.
      if (!isLive && excalidrawAPI) {
        for (const fileId of selectOversizedImages(
          elements,
          files,
          storedFileIdSet,
        )) {
          markImageStatus(excalidrawAPI, fileId, "error")
          toastImageTooLarge()
        }
      }
      handleChange({ elements, appState, files })
      // No-op until the device copy is kept.
      deviceChange({ elements, appState, files })
      // No-op until the room is joined.
      roomChange(elements, appState, files)
    },
    [
      observeViewport,
      following,
      readOnly,
      handleChange,
      deviceChange,
      roomChange,
      isLive,
      excalidrawAPI,
      storedFileIdSet,
    ],
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
    // `isolate`: Excalidraw's phone bars have a z-index above the app's
    // sheets and dialogs, and would show through them.
    <div
      className={cn(
        "@container/canvas relative isolate size-full",
        readOnly && READ_ONLY_CLASS,
      )}
    >
      <Excalidraw
        initialData={getInitialData}
        initialState={initialState}
        onExcalidrawAPI={setExcalidrawAPI}
        // Controlled: the canvas renders in the app theme, and a theme baked
        // into the saved scene state is ignored on load. With the prop set,
        // Excalidraw disables its toggleTheme action, which also retires the
        // Shift+Alt+D shortcut; `toggleTheme: false` pins that down.
        theme={canvasTheme}
        langCode={getLocale()}
        viewModeEnabled={readOnly || undefined}
        onChange={handleSceneChange}
        onPointerUpdate={readOnly ? undefined : room.onPointerUpdate}
        onScrollChange={readOnly ? undefined : room.onScrollChange}
        onLibraryChange={handleLibraryChange}
        userToFollow={room.userToFollow}
        viewportStatusFrame={followStatusFrame}
        renderTopLeftUI={() => (
          <TopLeftControls
            // `key` resets the uncontrolled input when the cached drawing name
            // changes from outside (e.g., rename triggered in the sidebar).
            key={drawing.name}
            initialName={drawing.name}
            readOnly={readOnly}
            onToggleSidebar={toggleSidebar}
            onSubmit={handleNameSubmit}
          />
        )}
        renderTopRightUI={
          readOnly
            ? undefined
            : // On a phone these are in the menu, and null keeps Excalidraw's
              // own Library button there.
              (isMobile) =>
                isMobile ? null : (
                  <>
                    <PresenceAvatars room={room} className={PRESENCE_CLASS} />
                    <CommentsButton
                      drawingId={drawingId}
                      active={commentsOpen}
                      onClick={toggleComments}
                      className={SHARE_BUTTON_CLASS}
                    />
                    <Button
                      data-tour="share"
                      onClick={() => setShareOpen(true)}
                      aria-label={m.drawing_share()}
                      title={m.drawing_share()}
                      className={SHARE_BUTTON_CLASS}
                    >
                      <Share2Icon className="h-3.5 w-3.5" />
                      <span className={SHARE_LABEL_CLASS}>
                        {m.drawing_share()}
                      </span>
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
            {m.drawing_menu_drawings()}
          </MainMenu.Item>
          {!readOnly && (
            <MainMenu.Item
              className={SHARE_MENU_ITEM_CLASS}
              icon={<Share2Icon className="h-4 w-4" />}
              onSelect={() => setShareOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                {m.drawing_share()}
                {share != null && <SharingDot />}
              </span>
            </MainMenu.Item>
          )}
          <MainMenu.Item
            // Read-only canvases have no top-right bar, so the menu is the way in.
            className={readOnly ? undefined : SHARE_MENU_ITEM_CLASS}
            icon={<MessageSquareIcon className="h-4 w-4" />}
            onSelect={toggleComments}
          >
            {m.comments_title()}
          </MainMenu.Item>
          {!readOnly && !isTeam && requestMoveToTeam && (
            <MainMenu.Item
              icon={<Users className="h-4 w-4" />}
              onSelect={() =>
                requestMoveToTeam(
                  { type: "drawing", id: drawingId },
                  drawing.name,
                )
              }
            >
              {m.drawing_menu_move_to_team()}
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
          <MainMenu.Group title={m.drawing_menu_excalidraw_links()}>
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
            <SaveStatusPill
              saving={saving && !onDevice}
              saved={saved}
              onDevice={onDevice}
            />
          </FooterRightPortal>
        )}
      </Excalidraw>
      <CommentsLayer
        drawingId={drawingId}
        excalidrawAPI={excalidrawAPI}
        readOnly={readOnly}
        panelOpen={commentsOpen}
        onPanelOpenChange={setCommentsOpen}
      />
      {!readOnly && (
        <DrawingEditCard
          drawingId={drawingId}
          excalidrawAPI={excalidrawAPI}
          theme={canvasTheme}
        />
      )}
      {!readOnly && (
        <ShareDialog
          drawingId={drawingId}
          isTeam={isTeam}
          open={shareOpen}
          onOpenChange={setShareOpen}
          onBeforeCreate={flushToServer}
        />
      )}
    </div>
  )
}

export default DrawingCanvas
