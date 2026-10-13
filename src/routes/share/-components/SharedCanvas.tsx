// The canvas a share-link visitor lands on. It joins the drawing's room on
// open, so everyone here sees each other's cursors, presence and edits
// (canvas sharing #118, #119). Always light, per the logged-out pages
// convention (spec §1.3).
//
// The chrome is all in-canvas (spec §1.3, prototype variant A): no app shell,
// no sidebar, no gallery. The drawing's title portals into Excalidraw's own
// top-left island, presence and the visitor's name pill ride the top-right
// row, and the attribution sits in the bottom-right footer.

import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useCallback, useMemo, useState } from "react"
import {
  FooterRightPortal,
  TopLeftPortal,
} from "@/components/excalidraw-portal"
import { FollowModeOverlay } from "@/components/follow-mode-overlay"
import { MenuParticipants } from "@/components/menu-participants"
import { MenuReconnecting } from "@/components/menu-reconnecting"
import { PresenceAvatars } from "@/components/presence-avatars"
import { ReconnectingIndicator } from "@/components/reconnecting-indicator"
import {
  getOrCreateGuestName,
  rememberGuestName,
} from "@/features/collab/guest-identity"
import { useRoom } from "@/features/collab/use-room"
import {
  buildInitialSceneData,
  type PersistedFile,
} from "@/features/drawings/scene"
import { GuestAttribution } from "./GuestAttribution"
import { GuestNamePill } from "./GuestNamePill"
import { GuestTitle } from "./GuestTitle"

import "@excalidraw/excalidraw/index.css"

// Excalidraw's top row doesn't shrink, so items that don't fit move to the
// burger menu. Seams are canvas widths, measured with the worst case: a long
// title, a long name, and five others in the room. The `!` beats Excalidraw's
// later-loaded `.dropdown-menu-item { display: flex }`.
const NAME_PILL_CLASS = "@max-[86rem]/canvas:hidden"
const NAME_MENU_ROW_CLASS = "@min-[86rem]/canvas:hidden!"
const PRESENCE_CLASS = "@max-[72rem]/canvas:hidden"
const PRESENCE_MENU_ROW_CLASS = "@min-[72rem]/canvas:hidden!"

type Props = {
  drawing: { id: string; name: string; data: string }
  files: PersistedFile[]
  /** The share token this visitor arrived on; also the room's dial string. */
  token: string
  /** The room refused this visitor at its participant cap (spec §4.5). */
  onRoomFull: () => void
  /** The link stopped checking out while this tab held it (spec §5.3). */
  onLinkDead: () => void
}

export function SharedCanvas({
  drawing,
  files,
  token,
  onRoomFull,
  onLinkDead,
}: Props) {
  const initialData = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }).initialData,
    [drawing.data, files],
  )
  // The drawing's images from before this visit: already in the database, so
  // this tab must not POST them back to the room-scoped endpoint (spec §2.4).
  const storedFileIds = useMemo(() => files.map((file) => file.fileId), [files])
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  // The name a guest kept from a previous visit, generated on first arrival.
  // Signed-in members send it too; the server ignores it for them and uses
  // the session's display name instead.
  const [name, setName] = useState(getOrCreateGuestName)

  // `self` is how the room sees this tab — null until the join lands.
  const room = useRoom({
    token,
    name,
    excalidrawAPI,
    onRoomFull,
    onLinkDead,
    storedFileIds,
  })

  // Renaming re-announces the name to the room (useRoom rejoins on the
  // change) and keeps it for the next visit, where a fresh connection id
  // would otherwise mean a fresh pseudonym (spec §4.4).
  const handleNameChange = useCallback((next: string) => {
    const remembered = rememberGuestName(next)
    if (remembered) setName(remembered)
  }, [])

  // A member who opened someone else's link is on this page too (spec §1.1) —
  // they neither name themselves nor need a way in. Before the room answers,
  // guest is the assumption: it is the common case, it is what the local name
  // already assumes, and a socket that never opens leaves a guest with a
  // working pill rather than a permanently frozen one. The cost is that a
  // member who renames in that window watches the pill snap back to their
  // session name when the roster lands.
  const isGuest = room.self?.isGuest ?? true
  // A guest is shown the name it holds locally, never the roster's copy: the
  // server seats it under a pseudonym of its own until the JOIN carrying the
  // real name lands, and that stand-in must not flash through the pill. A
  // member's name is only ever the session's, which arrives with the roster.
  const shownName = isGuest ? name : (room.self?.name ?? name)

  return (
    <div className="@container/canvas relative h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawAPI}
        theme="light"
        onChange={room.onChange}
        onPointerUpdate={room.onPointerUpdate}
        onScrollChange={room.onScrollChange}
        // Excalidraw lays this row out after its toolbar without wrapping, so
        // in mobile layout it starts past the right edge whatever is in it.
        // Everything moves to the burger menu there rather than clipping.
        renderTopRightUI={(isMobile) =>
          isMobile ? null : (
            <>
              {/* Where the avatars were: a disconnected tab has no roster to
                  show, so the two never compete for the row. */}
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
          },
        }}
      >
        {/* Declaring a menu replaces Excalidraw's default one, so the items
            below are that default, restated — minus the entries `UIOptions`
            already turns off for this surface. */}
        <MainMenu>
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
              // In the menu it is a row, not an island: no card of its own,
              // and free to use the width the dropdown gives it.
              className="h-9 w-full max-w-none bg-transparent px-2 shadow-none"
            />
            <MainMenu.Separator />
          </div>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.Group title="Excalidraw links">
            <MainMenu.DefaultItems.Socials />
          </MainMenu.Group>
        </MainMenu>
        <TopLeftPortal>
          <GuestTitle name={drawing.name} />
        </TopLeftPortal>
        <FooterRightPortal>
          <GuestAttribution token={token} showSignIn={isGuest} />
        </FooterRightPortal>
      </Excalidraw>
      {/* Outside the canvas, so the ring frames the whole surface — chrome
          portaled inside would sit under it. */}
      <FollowModeOverlay room={room} />
    </div>
  )
}

export default SharedCanvas
