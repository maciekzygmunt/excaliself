// The canvas a share-link visitor lands on. It joins the drawing's room on
// open, so everyone here sees each other's cursors, presence and edits
// (canvas sharing #118, #119). Flushing those edits back to the database is
// the next slice. Always light, per the logged-out pages convention
// (spec §1.3).
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
import { MenuParticipants } from "./MenuParticipants"
import { PresenceAvatars } from "./PresenceAvatars"

import "@excalidraw/excalidraw/index.css"

// The top-right row holds the presence avatars and the visitor's name pill,
// and it has to share the strip with Excalidraw's own toolbar. The pill is
// the wider and the less urgent of the two — it is set once and forgotten,
// while the avatars are both who-is-here and follow mode's entry point — so
// below the seam the pill leaves the row for the burger menu, the same trade
// the member canvas makes with its Share button.
//
// The seam is the canvas area, not the viewport — this surface has no
// sidebar, but Excalidraw's toolbar is a fixed-width island the row is laid
// out after, so what matters is how much is left beside it.
//
// 50rem rather than a round breakpoint because the pill is not a fixed width:
// its field grows with the name to `max-w-40` (10rem), so the seam has to
// clear the longest name the field will accept, not the pseudonym a visitor
// happens to arrive with. Measured with a short name it would look like 43rem
// is enough, and then a visitor types their full name and it clips.
const NAME_PILL_CLASS = "@max-[50rem]/canvas:hidden"
// The ! is load-order armor, as on the member canvas: Excalidraw's
// lazy-loaded sheet declares .dropdown-menu-item { display: flex } after ours
// and would win the tie against a plain `hidden`.
const NAME_MENU_ROW_CLASS = "@min-[50rem]/canvas:hidden!"

type Props = {
  drawing: { id: string; name: string; data: string }
  files: PersistedFile[]
  /** The share token this visitor arrived on; also the room's dial string. */
  token: string
  /** The room refused this visitor at its participant cap (spec §4.5). */
  onRoomFull: () => void
}

export function SharedCanvas({ drawing, files, token, onRoomFull }: Props) {
  const initialData = useMemo(
    () => buildInitialSceneData({ data: drawing.data, files }).initialData,
    [drawing.data, files],
  )
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)

  // The name a guest kept from a previous visit, generated on first arrival.
  // Signed-in members send it too; the server ignores it for them and uses
  // the session's display name instead.
  const [name, setName] = useState(getOrCreateGuestName)

  // `self` is how the room sees this tab — null until the join lands.
  const {
    self,
    others,
    onChange,
    onPointerUpdate,
    followedParticipant,
    onScrollChange,
    toggleFollow,
    stopFollowing,
  } = useRoom({ token, name, excalidrawAPI, onRoomFull })

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
  const isGuest = self?.isGuest ?? true
  // A guest is shown the name it holds locally, never the roster's copy: the
  // server seats it under a pseudonym of its own until the JOIN carrying the
  // real name lands, and that stand-in must not flash through the pill. A
  // member's name is only ever the session's, which arrives with the roster.
  const shownName = isGuest ? name : (self?.name ?? name)

  return (
    <div className="@container/canvas relative h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawAPI}
        theme="light"
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        onScrollChange={onScrollChange}
        // Excalidraw lays this row out after its toolbar without wrapping, so
        // in mobile layout it starts past the right edge whatever is in it.
        // Everything moves to the burger menu there rather than clipping.
        renderTopRightUI={(isMobile) =>
          isMobile ? null : (
            <>
              <PresenceAvatars
                participants={others}
                followedConnectionId={followedParticipant?.connectionId ?? null}
                onFollow={toggleFollow}
              />
              <GuestNamePill
                name={shownName}
                color={self?.color ?? null}
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
          <MenuParticipants
            participants={others}
            followedConnectionId={followedParticipant?.connectionId ?? null}
            onFollow={toggleFollow}
          />
          <div className={NAME_MENU_ROW_CLASS}>
            <GuestNamePill
              name={shownName}
              color={self?.color ?? null}
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
      <FollowModeOverlay
        participant={followedParticipant}
        onStop={stopFollowing}
      />
    </div>
  )
}

export default SharedCanvas
