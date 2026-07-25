/**
 * The client half of the room socket (canvas sharing spec §2.1–§2.2): dial
 * the room, announce a name, publish this tab's cursor, and hand remote
 * presence to Excalidraw.
 *
 * Cursors deliberately never touch React state — a room of five peers at
 * ~30 Hz would re-render the canvas host 150 times a second. Incoming
 * pointers land in a ref and go straight to `updateScene({ collaborators })`;
 * only the roster (which changes when someone joins or leaves) is state.
 *
 * Reconnection, heartbeats, and the frame cap are a later slice; a dropped
 * socket here stays dropped until the page is reloaded.
 */

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toCollaborators } from "./collaborators"
import type { ClientMessage, Participant, PointerUpdate } from "./protocol"
import { parseServerMessage } from "./protocol"
import { roomSocketUrl } from "./room-url"
import { CURSOR_INTERVAL_MS, createDroppableThrottle } from "./throttle"

/**
 * Skip a cursor frame when the socket is already backed up rather than
 * queueing it — the droppable half of "droppable channel". Roughly a few
 * dozen cursor frames' worth of bytes.
 */
const CURSOR_BACKPRESSURE_BYTES = 8 * 1024

/** What Excalidraw's `onPointerUpdate` hands us; selection comes from appState. */
type PointerMove = Omit<PointerUpdate, "selectedElementIds">

export function useRoom(options: {
  /** The share token from the URL; null keeps the socket closed. */
  token: string | null
  /** This tab's display name. Only honored by the server for guests. */
  name: string
  excalidrawAPI: ExcalidrawImperativeAPI | null
}) {
  const { token, name, excalidrawAPI } = options

  const [participants, setParticipants] = useState<Participant[]>([])
  const [selfConnectionId, setSelfConnectionId] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const pointersRef = useRef(new Map<string, PointerUpdate>())
  const participantsRef = useRef<Participant[]>([])
  const selfConnectionIdRef = useRef<string | null>(null)
  // Read through refs inside the socket callbacks so the connection effect
  // depends on the token alone — a rename or a late-arriving API must not
  // tear the socket down and rejoin the room.
  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const nameRef = useRef(name)
  nameRef.current = name

  const pushCollaborators = useCallback(() => {
    apiRef.current?.updateScene({
      collaborators: toCollaborators({
        participants: participantsRef.current,
        pointers: pointersRef.current,
        selfConnectionId: selfConnectionIdRef.current,
      }),
    })
  }, [])

  const setRoster = useCallback(
    (roster: Participant[]) => {
      participantsRef.current = roster
      setParticipants(roster)
      // Drop cursors belonging to connections that are gone, so a departed
      // participant's pointer can't be resurrected by a stale entry.
      const present = new Set(roster.map((p) => p.connectionId))
      for (const id of pointersRef.current.keys()) {
        if (!present.has(id)) pointersRef.current.delete(id)
      }
      pushCollaborators()
    },
    [pushCollaborators],
  )

  /** Every outbound frame goes through here, so the union stays enforced. */
  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  useEffect(() => {
    if (!token) return

    const socket = new WebSocket(roomSocketUrl(token, window.location))
    socketRef.current = socket

    socket.addEventListener("open", () => {
      send({ type: "JOIN", payload: { name: nameRef.current } })
    })

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const message = parseServerMessage(event.data)
      if (!message) return

      if (message.type === "ROOM_JOINED") {
        selfConnectionIdRef.current = message.payload.connectionId
        setSelfConnectionId(message.payload.connectionId)
        setRoster(message.payload.participants)
        return
      }
      if (message.type === "PARTICIPANTS") {
        setRoster(message.payload.participants)
        return
      }

      const { connectionId, ...pointer } = message.payload
      pointersRef.current.set(connectionId, pointer)
      pushCollaborators()
    })

    const handleClosed = () => {
      selfConnectionIdRef.current = null
      setSelfConnectionId(null)
      pointersRef.current.clear()
      setRoster([])
    }
    socket.addEventListener("close", handleClosed)
    // An error is always followed by a close event; letting it through
    // unhandled would surface as an unhandled rejection in the console.
    socket.addEventListener("error", () => {})

    return () => {
      socket.removeEventListener("close", handleClosed)
      socket.close()
      socketRef.current = null
      pointersRef.current.clear()
      participantsRef.current = []
      selfConnectionIdRef.current = null
    }
  }, [token, send, setRoster, pushCollaborators])

  // Rejoining is what re-announces a name, so this only matters while the
  // socket is already open (the guest name pill lands in a later slice).
  useEffect(() => {
    send({ type: "JOIN", payload: { name } })
  }, [name, send])

  const allowCursor = useRef(createDroppableThrottle(CURSOR_INTERVAL_MS))
  const onPointerUpdate = useCallback(
    (move: PointerMove) => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return
      if (socket.bufferedAmount > CURSOR_BACKPRESSURE_BYTES) return
      if (!allowCursor.current()) return
      send({
        type: "MOUSE_LOCATION",
        payload: {
          pointer: move.pointer,
          button: move.button,
          selectedElementIds:
            apiRef.current?.getAppState().selectedElementIds ?? {},
        },
      })
    },
    [send],
  )

  // Who else is here — the same exclusion the collaborator map makes, so the
  // avatars and the cursors can never disagree about who is remote.
  const others = useMemo(
    () => participants.filter((p) => p.connectionId !== selfConnectionId),
    [participants, selfConnectionId],
  )

  return { participants, others, selfConnectionId, onPointerUpdate }
}
