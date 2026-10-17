/**
 * Client half of the room socket. Cursors and scene traffic never touch React
 * state (they fire ~30 Hz); only the roster is state. Reconnects forever.
 */

import {
  CaptureUpdateAction,
  reconcileElements,
  restoreElements,
} from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createReconnectBackoff } from "./backoff"
import { toCollaborators } from "./collaborators"
import { createHeartbeat, type Heartbeat } from "./heartbeat"
import type {
  ClientMessage,
  Participant,
  PointerUpdate,
  SceneElement,
} from "./protocol"
import {
  DRAWING_TRASHED_CLOSE_CODE,
  LINK_DEAD_CLOSE_CODE,
  parseServerMessage,
  ROOM_FULL_CLOSE_CODE,
  SCENE_UNREADABLE_CLOSE_CODE,
} from "./protocol"
import { type RoomPath, roomSocketUrl } from "./room-url"
import {
  createSceneBroadcaster,
  SYNC_FULL_SCENE_INTERVAL_MS,
  splitSceneFrames,
} from "./scene-sync"
import { CURSOR_INTERVAL_MS, createDroppableThrottle } from "./throttle"
import { useFollow } from "./use-follow"
import { useRoomFiles } from "./use-room-files"

/** Drop (not queue) cursor/viewport frames past this; they supersede themselves. */
const BACKPRESSURE_BYTES = 8 * 1024

/** What Excalidraw's `onPointerUpdate` hands us; selection comes from appState. */
type PointerMove = Omit<PointerUpdate, "selectedElementIds">

/** Only `reconnecting` shows an indicator; the first dial is under the page loader. */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting"

/** What the presence chrome reads from a room. */
export type RoomPresence = Pick<
  ReturnType<typeof useRoom>,
  "others" | "followedParticipant" | "toggleFollow" | "stopFollowing"
>

export function useRoom(options: {
  /** The Room's address; null keeps the socket closed. */
  room: RoomPath | null
  /** Guest display name; null for members, whose name the server takes from the session. */
  name: string | null
  excalidrawAPI: ExcalidrawImperativeAPI | null
  /** The room turned this tab away at its participant cap. */
  onRoomFull: () => void
  /**
   * The room refused this tab (link dead, drawing trashed); the socket stops
   * and the page re-resolves. `trashedBy` names who trashed it, for members
   * only, and is null on the trasher's own tabs.
   */
  onLinkDead: (trashedBy: string | null) => void
  /** The stored scene is damaged, so no room opens; the socket stops. */
  onSceneUnreadable: () => void
  /** Image ids already stored before this visit. Must be referentially stable. */
  storedFileIds: readonly string[]
}) {
  const {
    room,
    name,
    excalidrawAPI,
    onRoomFull,
    onLinkDead,
    onSceneUnreadable,
    storedFileIds,
  } = options

  const [participants, setParticipants] = useState<Participant[]>([])
  const [selfConnectionId, setSelfConnectionId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")

  const socketRef = useRef<WebSocket | null>(null)
  const broadcasterRef = useRef(createSceneBroadcaster())
  const sceneInitializedRef = useRef(false)
  const fullSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointersRef = useRef(new Map<string, PointerUpdate>())
  const participantsRef = useRef<Participant[]>([])
  const selfConnectionIdRef = useRef<string | null>(null)
  // Refs keep the socket effect keyed on the room only; a rename must not reconnect.
  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const nameRef = useRef(name)
  nameRef.current = name
  const onRoomFullRef = useRef(onRoomFull)
  onRoomFullRef.current = onRoomFull
  const onLinkDeadRef = useRef(onLinkDead)
  onLinkDeadRef.current = onLinkDead
  const onSceneUnreadableRef = useRef(onSceneUnreadable)
  onSceneUnreadableRef.current = onSceneUnreadable

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
      const present = new Set(roster.map((p) => p.connectionId))
      for (const id of pointersRef.current.keys()) {
        if (!present.has(id)) pointersRef.current.delete(id)
      }
      pushCollaborators()
    },
    [pushCollaborators],
  )

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const isBackedUp = useCallback(
    () => (socketRef.current?.bufferedAmount ?? 0) > BACKPRESSURE_BYTES,
    [],
  )

  // Image bytes ride HTTP, not the socket.
  const { uploadPending, fetchMissing } = useRoomFiles({
    room,
    excalidrawAPI,
    storedFileIds,
  })

  const follow = useFollow({ excalidrawAPI, send, isBackedUp })
  const followRef = useRef(follow)
  followRef.current = follow

  /** Splits large scenes so no frame trips the server's size cap. */
  const sendScene = useCallback(
    (elements: SceneElement[]) => {
      let sent = false
      for (const frame of splitSceneFrames(elements))
        sent =
          send({ type: "SCENE_UPDATE", payload: { elements: frame } }) || sent
      return sent
    },
    [send],
  )

  /** Re-sends the full scene once after a broadcast; an idle room stays quiet. */
  const queueFullSync = useCallback(() => {
    if (fullSyncTimerRef.current !== null) return
    fullSyncTimerRef.current = setTimeout(() => {
      fullSyncTimerRef.current = null
      const elements = apiRef.current?.getSceneElementsIncludingDeleted()
      if (elements) sendScene(broadcasterRef.current.full(elements))
    }, SYNC_FULL_SCENE_INTERVAL_MS)
  }, [sendScene])

  // Upload runs before the SCENE_INIT gate: it needs only the room. Deltas
  // wait for SCENE_INIT, or the catch-up would skip edits made while dialing.
  const onChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      _appState: unknown,
      files: BinaryFiles,
    ) => {
      uploadPending(elements, files)
      if (!sceneInitializedRef.current) return
      const delta = broadcasterRef.current.delta(elements)
      if (delta && sendScene(delta)) queueFullSync()
    },
    [sendScene, queueFullSync, uploadPending],
  )

  /** Restores and reconciles a remote frame, kept out of the undo stack. */
  const applyRemoteScene = useCallback(
    (remote: SceneElement[]) => {
      const api = apiRef.current
      if (!api) return null
      // Casts: wire elements are unproven until `restoreElements` validates them.
      const restored = restoreElements(remote as never, null)
      const reconciled = reconcileElements(
        api.getSceneElementsIncludingDeleted(),
        restored as never,
        api.getAppState(),
      )
      // Before updateScene: it fires onChange synchronously and would echo this merge.
      broadcasterRef.current.received(remote, reconciled)
      api.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      fetchMissing(reconciled)
      return reconciled
    },
    [fetchMissing],
  )

  /** Runs on every close: the room may have restarted, so "seen" state is stale. */
  const forgetConnection = useCallback(() => {
    selfConnectionIdRef.current = null
    setSelfConnectionId(null)
    pointersRef.current.clear()
    setRoster([])
    followRef.current.reset()
    if (fullSyncTimerRef.current !== null) {
      clearTimeout(fullSyncTimerRef.current)
      fullSyncTimerRef.current = null
    }
    broadcasterRef.current = createSceneBroadcaster()
    sceneInitializedRef.current = false
  }, [setRoster])

  // Dial only once the canvas exists, so SCENE_INIT has somewhere to land.
  const canvasReady = excalidrawAPI !== null

  useEffect(() => {
    if (!room || !canvasReady) return

    // Shared across dials so the wait grows over a whole outage.
    const backoff = createReconnectBackoff()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false
    let beat: Heartbeat | null = null
    let everJoined = false

    const connect = () => {
      const socket = new WebSocket(roomSocketUrl(room, window.location))
      socketRef.current = socket
      beat = createHeartbeat({
        ping: () => send({ type: "PING", payload: {} }),
        // A silent OPEN socket died without a FIN; closing it triggers the retry.
        onSilent: () => socket.close(),
      })
      const ownBeat = beat

      socket.addEventListener("open", () => {
        ownBeat.start()
        const name = nameRef.current
        if (name !== null) send({ type: "JOIN", payload: { name } })
      })

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return
        const message = parseServerMessage(event.data)
        if (!message) return

        switch (message.type) {
          case "PONG":
            ownBeat.acknowledge()
            return

          case "ROOM_JOINED":
            // Not on `open`: a server that accepts and then drops the socket
            // must not reset the backoff.
            backoff.reset()
            everJoined = true
            setConnectionStatus("connected")
            selfConnectionIdRef.current = message.payload.connectionId
            setSelfConnectionId(message.payload.connectionId)
            setRoster(message.payload.participants)
            return

          case "PARTICIPANTS":
            setRoster(message.payload.participants)
            return

          case "FOLLOWED_BY":
          case "USER_VISIBLE_SCENE_BOUNDS":
            followRef.current.handleServerMessage(message)
            return

          case "SCENE_INIT": {
            const merged = applyRemoteScene(message.payload.elements)
            if (!merged) return
            sceneInitializedRef.current = true
            if (sendScene(broadcasterRef.current.catchUp(merged)))
              queueFullSync()
            return
          }

          case "SCENE_UPDATE":
            applyRemoteScene(message.payload.elements)
            return

          case "MOUSE_LOCATION": {
            const { connectionId, ...pointer } = message.payload
            pointersRef.current.set(connectionId, pointer)
            pushCollaborators()
            return
          }

          default:
            return message satisfies never
        }
      })

      socket.addEventListener("close", (event: CloseEvent) => {
        ownBeat.stop()
        // Closes are async: an old socket's close can land after a new one joined.
        if (disposed || socketRef.current !== socket) return
        socketRef.current = null
        forgetConnection()

        // Terminal only before the first join; a rejoining tab may beat the
        // server's release of its old seat and must keep its canvas.
        if (event.code === ROOM_FULL_CLOSE_CODE && !everJoined) {
          onRoomFullRef.current()
          return
        }
        if (event.code === LINK_DEAD_CLOSE_CODE) {
          onLinkDeadRef.current(null)
          return
        }
        if (event.code === DRAWING_TRASHED_CLOSE_CODE) {
          onLinkDeadRef.current(event.reason || null)
          return
        }
        if (event.code === SCENE_UNREADABLE_CLOSE_CODE) {
          onSceneUnreadableRef.current()
          return
        }

        setConnectionStatus("reconnecting")
        retryTimer = setTimeout(connect, backoff.next())
      })
      // A close always follows; this only silences the console.
      socket.addEventListener("error", () => {})
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      beat?.stop()
      socketRef.current?.close()
      socketRef.current = null
      participantsRef.current = []
      forgetConnection()
      // A stopped share must not leave "Reconnecting…" up.
      setConnectionStatus("connecting")
    }
  }, [
    room,
    canvasReady,
    send,
    sendScene,
    queueFullSync,
    setRoster,
    pushCollaborators,
    applyRemoteScene,
    forgetConnection,
  ])

  // Re-announces a guest rename while the socket is open.
  useEffect(() => {
    if (name !== null) send({ type: "JOIN", payload: { name } })
  }, [name, send])

  const allowCursor = useRef(createDroppableThrottle(CURSOR_INTERVAL_MS))
  const onPointerUpdate = useCallback(
    (move: PointerMove) => {
      const socket = socketRef.current
      if (socket?.readyState !== WebSocket.OPEN) return
      if (isBackedUp()) return
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
    [send, isBackedUp],
  )

  const others = useMemo(
    () => participants.filter((p) => p.connectionId !== selfConnectionId),
    [participants, selfConnectionId],
  )
  // Null until the join lands.
  const self = useMemo(
    () => participants.find((p) => p.connectionId === selfConnectionId) ?? null,
    [participants, selfConnectionId],
  )

  // Null as soon as the followed person leaves the roster.
  const followedParticipant = useMemo(
    () =>
      others.find((p) => p.connectionId === follow.followedConnectionId) ??
      null,
    [others, follow.followedConnectionId],
  )

  return {
    self,
    others,
    connectionStatus,
    onChange,
    onPointerUpdate,
    followedParticipant,
    onScrollChange: follow.onScrollChange,
    toggleFollow: follow.toggleFollow,
    stopFollowing: follow.stopFollowing,
  }
}
