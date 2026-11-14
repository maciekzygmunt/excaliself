import {
  Excalidraw,
  MainMenu,
  useEditorInterface,
} from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useNavigate } from "@tanstack/react-router"
import { LogInIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { FooterRightPortal } from "@/components/excalidraw-portal"
import { useFollowStatusFrame } from "@/components/follow-status-frame"
import { MenuParticipants } from "@/components/menu-participants"
import { MenuReconnecting } from "@/components/menu-reconnecting"
import { PresenceAvatars } from "@/components/presence-avatars"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import {
  getOrCreateGuestName,
  rememberGuestName,
} from "@/features/collab/guest-identity"
import { roomPathForToken } from "@/features/collab/room-url"
import { useRoom } from "@/features/collab/use-room"
import {
  buildInitialSceneData,
  fitToContent,
  type PersistedFile,
} from "@/features/drawings/scene"
import { useBlockClearCanvasShortcut } from "@/hooks/use-block-clear-canvas-shortcut"
import { GuestAttribution } from "./GuestAttribution"
import { GuestNamePill } from "./GuestNamePill"
import { GuestTitle } from "./GuestTitle"

import "@excalidraw/excalidraw/index.css"

// Excalidraw's top row doesn't shrink, so what doesn't fit moves to the menu.
// `!` beats Excalidraw's later-loaded `.dropdown-menu-item { display: flex }`.
const NAME_PILL_CLASS = "@max-[86rem]/canvas:hidden"
const NAME_MENU_ROW_CLASS = "@min-[86rem]/canvas:hidden!"
const PRESENCE_CLASS = "@max-[72rem]/canvas:hidden"
const PRESENCE_MENU_ROW_CLASS = "@min-[72rem]/canvas:hidden!"

type Props = {
  drawing: { id: string; name: string; data: string }
  files: PersistedFile[]
  token: string
  onRoomFull: () => void
  onLinkDead: () => void
  onSceneUnreadable: () => void
}

export function SharedCanvas({
  drawing,
  files,
  token,
  onRoomFull,
  onLinkDead,
  onSceneUnreadable,
}: Props) {
  const initialData = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }).initialData,
    [drawing.data, files],
  )
  const initialState = useMemo(() => fitToContent(initialData), [initialData])
  // Already stored, so this tab must not upload them again.
  const storedFileIds = useMemo(() => files.map((file) => file.fileId), [files])
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  // Members send it too; the server uses their session name instead.
  const [name, setName] = useState(getOrCreateGuestName)

  const room = useRoom({
    room: roomPathForToken(token),
    name,
    excalidrawAPI,
    onRoomFull,
    onLinkDead,
    onSceneUnreadable,
    storedFileIds,
  })
  const followStatusFrame = useFollowStatusFrame(room)
  // A reset would wipe the drawing for everyone in the room.
  useBlockClearCanvasShortcut()

  const handleNameChange = useCallback((next: string) => {
    const remembered = rememberGuestName(next)
    if (remembered) setName(remembered)
  }, [])

  // Assume guest until the room answers, so a socket that never opens still
  // leaves a working name pill.
  const isGuest = room.self?.isGuest ?? true
  // Guests show the local name so the server's stand-in pseudonym never flashes.
  const shownName = isGuest ? name : (room.self?.name ?? name)

  return (
    <div className="@container/canvas relative h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        initialState={initialState}
        onExcalidrawAPI={setExcalidrawAPI}
        theme="light"
        onChange={room.onChange}
        onPointerUpdate={room.onPointerUpdate}
        onScrollChange={room.onScrollChange}
        userToFollow={room.userToFollow}
        viewportStatusFrame={followStatusFrame}
        renderTopLeftUI={() => (
          <GuestTitle name={drawing.name} className="hidden lg:flex" />
        )}
        // On a phone this row has no room, so it all moves to the menu.
        renderTopRightUI={(isMobile) =>
          isMobile ? null : (
            <>
              <ReconnectingIndicator
                status={room.connectionStatus}
                className={PRESENCE_CLASS}
              />
              <PresenceAvatars room={room} className={PRESENCE_CLASS} />
              <GuestNamePill
                name={shownName}
                color={room.self?.color ?? null}
                editable={isGuest}
                onNameChange={handleNameChange}
                className={NAME_PILL_CLASS}
              />
            </>
          )
        }
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            clearCanvas: false,
          },
        }}
      >
        {/* A custom menu replaces the default, so its items are restated. */}
        <MainMenu>
          {/* Stands in for the top-left title where that one is hidden. */}
          <div className="lg:hidden">
            <GuestTitle name={drawing.name} className="px-2 py-2" />
            <MainMenu.Separator />
          </div>
          <MenuReconnecting
            status={room.connectionStatus}
            className={PRESENCE_MENU_ROW_CLASS}
          />
          <MenuParticipants room={room} className={PRESENCE_MENU_ROW_CLASS} />
          <div className={NAME_MENU_ROW_CLASS}>
            <GuestNamePill
              name={shownName}
              color={room.self?.color ?? null}
              editable={isGuest}
              onNameChange={handleNameChange}
              className="h-9 w-full max-w-none bg-transparent px-2 shadow-none"
            />
            <MainMenu.Separator />
          </div>
          {isGuest && <MenuSignIn token={token} />}
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.Group title="Excalidraw links">
            <MainMenu.DefaultItems.Socials />
          </MainMenu.Group>
        </MainMenu>
        <FooterRightPortal>
          <GuestAttribution token={token} showSignIn={isGuest} />
        </FooterRightPortal>
      </Excalidraw>
    </div>
  )
}

// The mobile layout drops the footer and its Sign in link, so it moves here.
function MenuSignIn({ token }: { token: string }) {
  const navigate = useNavigate()
  if (useEditorInterface().formFactor !== "phone") return null
  return (
    <MainMenu.Item
      icon={<LogInIcon className="h-4 w-4" />}
      onSelect={() =>
        navigate({ to: "/login", search: { redirect: `/share/${token}` } })
      }
    >
      Sign in
    </MainMenu.Item>
  )
}

export default SharedCanvas
