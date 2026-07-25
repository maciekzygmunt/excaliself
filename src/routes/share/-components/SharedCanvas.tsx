// The canvas a share-link visitor lands on. It joins the drawing's room on
// open, so everyone here sees each other's cursors and presence (canvas
// sharing #118). Scene edits are still local — sync and persistence are the
// next slices. Always light, per the logged-out pages convention (spec §1.3).
//
// The chrome is all in-canvas (spec §1.3, prototype variant A): no app shell,
// no sidebar, no gallery. The drawing's title portals into Excalidraw's own
// top-left island, presence and the visitor's name pill ride the top-right
// row, and the attribution sits in the bottom-right footer.

import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useCallback, useMemo, useState } from "react"
import {
  FooterRightPortal,
  TopLeftPortal,
} from "@/components/excalidraw-portal"
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
import { PresenceAvatars } from "./PresenceAvatars"

import "@excalidraw/excalidraw/index.css"

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
  const { self, others, onPointerUpdate } = useRoom({
    token,
    name,
    excalidrawAPI,
    onRoomFull,
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
  const isGuest = self?.isGuest ?? true
  // A guest is shown the name it holds locally, never the roster's copy: the
  // server seats it under a pseudonym of its own until the JOIN carrying the
  // real name lands, and that stand-in must not flash through the pill. A
  // member's name is only ever the session's, which arrives with the roster.
  const shownName = isGuest ? name : (self?.name ?? name)

  return (
    <div className="h-dvh w-full">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={setExcalidrawAPI}
        theme="light"
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={() => (
          <>
            <PresenceAvatars participants={others} />
            <GuestNamePill
              name={shownName}
              color={self?.color ?? null}
              editable={isGuest}
              onNameChange={handleNameChange}
            />
          </>
        )}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      >
        <TopLeftPortal>
          <GuestTitle name={drawing.name} />
        </TopLeftPortal>
        <FooterRightPortal>
          <GuestAttribution token={token} showSignIn={isGuest} />
        </FooterRightPortal>
      </Excalidraw>
    </div>
  )
}

export default SharedCanvas
