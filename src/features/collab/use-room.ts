/**
 * The client half of the room socket (canvas sharing spec §2.1–§2.2): dial
 * the room, announce a name, publish this tab's cursor and edits, and hand
 * what comes back to Excalidraw.
 *
 * Cursors deliberately never touch React state — a room of five peers at
 * ~30 Hz would re-render the canvas host 150 times a second. Incoming
 * pointers land in a ref and go straight to `updateScene({ collaborators })`;
 * only the roster (which changes when someone joins or leaves) is state.
 *
 * Scene traffic is the same shape: `onChange` fires on every pointer move
 * over the canvas, so nothing about it may cause a render either. What to
 * send is decided in `scene-sync.ts`; this file is the plumbing around it.
 *
 * A dropped socket is dialed again forever (spec §5.3). Editing carries on
 * against the local canvas the whole time — the sends simply no-op — and the
 * `SCENE_INIT` of the next join merges the two sides. The only closes that
 * end the loop are the two the server says something with: the participant
 * cap and a link that has died.
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
  LINK_DEAD_CLOSE_CODE,
  parseServerMessage,
  ROOM_FULL_CLOSE_CODE,
} from "./protocol"
import { roomSocketUrl } from "./room-url"
import {
  createSceneBroadcaster,
  SYNC_FULL_SCENE_INTERVAL_MS,
  splitSceneFrames,
} from "./scene-sync"
import { CURSOR_INTERVAL_MS, createDroppableThrottle } from "./throttle"
import { useFollow } from "./use-follow"
import { useRoomFiles } from "./use-room-files"

/**
 * Skip a frame when the socket is already backed up rather than queueing it
 * — the droppable half of "droppable channel". Roughly a few dozen cursor
 * frames' worth of bytes. Cursors and follow-mode viewports share the budget
 * because they share the socket, and both supersede themselves: whatever was
 * dropped is stale by the time the buffer drains.
 */
const BACKPRESSURE_BYTES = 8 * 1024

/** What Excalidraw's `onPointerUpdate` hands us; selection comes from appState. */
type PointerMove = Omit<PointerUpdate, "selectedElementIds">

/**
 * Where the socket stands, for the one piece of chrome that says so.
 * `connecting` is the first dial, before anything has gone wrong — the page
 * is already showing a loader, so it needs no second one. `reconnecting`
 * means a dial has failed or a live socket has dropped, and is the only
 * state the "Reconnecting…" indicator answers to (spec §5.3).
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting"

/** What the presence chrome reads from a room. */
export type RoomPresence = Pick<
  ReturnType<typeof useRoom>,
  "others" | "followedParticipant" | "toggleFollow" | "stopFollowing"
>

export function useRoom(options: {
  /** The share token from the URL; null keeps the socket closed. */
  token: string | null
  /**
   * This tab's display name, or null when it has none to offer — a member's
   * name comes from their session and the server ignores whatever the wire
   * claims, so the owner's own tab has nothing to say here.
   */
  name: string | null
  excalidrawAPI: ExcalidrawImperativeAPI | null
  /** The room turned this tab away at its participant cap (spec §4.5). */
  onRoomFull: () => void
  /**
   * The token stopped checking out — stopped, regenerated, audience
   * tightened, drawing trashed. The socket will not be dialed again, and the
   * page is expected to re-resolve the token (spec §5.3).
   */
  onLinkDead: () => void
  /**
   * The image ids the page loaded out of the database — the drawing's images
   * from before this visit. They are already stored, so this tab owes the
   * room nothing for them (spec §2.4). Must be referentially stable.
   */
  storedFileIds: readonly string[]
}) {
  const { token, name, excalidrawAPI, onRoomFull, onLinkDead, storedFileIds } =
    options

  const [participants, setParticipants] = useState<Participant[]>([])
  const [selfConnectionId, setSelfConnectionId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")

  const socketRef = useRef<WebSocket | null>(null)
  const broadcasterRef = useRef(createSceneBroadcaster())
  /** False until SCENE_INIT lands — this tab has nothing to broadcast against. */
  const sceneInitializedRef = useRef(false)
  const fullSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointersRef = useRef(new Map<string, PointerUpdate>())
  const participantsRef = useRef<Participant[]>([])
  const selfConnectionIdRef = useRef<string | null>(null)
  // Read through refs inside the socket callbacks so the connection effect
  // depends on the token and nothing else that changes — a rename must not
  // tear the socket down and rejoin the room.
  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const nameRef = useRef(name)
  nameRef.current = name
  const onRoomFullRef = useRef(onRoomFull)
  onRoomFullRef.current = onRoomFull
  const onLinkDeadRef = useRef(onLinkDead)
  onLinkDeadRef.current = onLinkDead

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

  /** Whether the socket's outbound buffer is too full to take another frame. */
  const isBackedUp = useCallback(
    () => (socketRef.current?.bufferedAmount ?? 0) > BACKPRESSURE_BYTES,
    [],
  )

  // Image bytes ride HTTP, not the socket (spec §2.4). Both halves are driven
  // from the two places below — local changes and remote frames — and, like
  // everything else in here, never cause a render.
  const { uploadPending, fetchMissing } = useRoomFiles({
    token,
    excalidrawAPI,
    storedFileIds,
  })

  const follow = useFollow({ excalidrawAPI, send, isBackedUp })
  // The socket effect must not re-run when follow state changes, so its
  // handlers are reached through a ref like everything else in there.
  const followRef = useRef(follow)
  followRef.current = follow

  /**
   * An empty selection is nothing for the room to rule on — don't send it.
   * Anything large enough to trip the server's frame cap goes out in pieces
   * instead of being refused (spec §5.4).
   */
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

  /**
   * The safety net of spec §2.2: 20 s after a broadcast, re-send the whole
   * scene once, repairing any peer that missed a frame. Queued by a broadcast
   * and nothing else, so a room where nobody is drawing goes quiet.
   */
  const queueFullSync = useCallback(() => {
    if (fullSyncTimerRef.current !== null) return
    fullSyncTimerRef.current = setTimeout(() => {
      fullSyncTimerRef.current = null
      const elements = apiRef.current?.getSceneElementsIncludingDeleted()
      if (elements) sendScene(broadcasterRef.current.full(elements))
    }, SYNC_FULL_SCENE_INTERVAL_MS)
  }, [sendScene])

  /**
   * Excalidraw's `onChange` — the one thing that puts local edits on the
   * wire. It fires on pointer moves and selections too, which is why the
   * broadcaster's scene-version gate comes first.
   *
   * Nothing is offered to the broadcaster until SCENE_INIT has landed. Asking
   * it before then would mark those elements as "the room has seen these"
   * while the socket was still opening, and the catch-up below — the one
   * thing that would have carried them — would then skip every one of them.
   *
   * The scene's `files` never reach the socket — image bytes travel over the
   * room-scoped HTTP endpoint instead (spec §2.4). The upload is offered
   * ahead of the SCENE_INIT gate on purpose: storing a blob needs the token,
   * not the room, and an image pasted while the socket is still opening would
   * otherwise sit `pending` until something else moved the scene.
   */
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

  /**
   * Apply a frame from the room: restore it (a wire payload is plain JSON,
   * and Excalidraw's invariants are not), reconcile it against what this tab
   * holds, then apply it with `CaptureUpdateAction.NEVER` so a peer's work
   * never lands in this tab's undo stack (spec §2.2). Returns the scene as
   * merged, for the callers that need to answer it.
   *
   * The merged scene is also what the blob half reads: a peer's image arrives
   * here as an element with no bytes, and its `saved` status is the signal
   * that the room-scoped endpoint has them.
   */
  const applyRemoteScene = useCallback(
    (remote: SceneElement[]) => {
      const api = apiRef.current
      if (!api) return null
      // Both casts cross the same gap: a `SceneElement` is an element the type
      // system has no proof about, and `restoreElements` is precisely the call
      // that establishes it — after which the branded remote/reconciled types
      // are bookkeeping upstream does for its own callers.
      const restored = restoreElements(remote as never, null)
      const reconciled = reconcileElements(
        api.getSceneElementsIncludingDeleted(),
        restored as never,
        api.getAppState(),
      )
      // Ahead of updateScene, which re-triggers onChange synchronously — after
      // it, this merge would go straight back out as if it were a local edit.
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

  /**
   * Everything the socket that just went away had established. Called on
   * every close, not only on unmount, because a reconnect is a *new*
   * connection to a room that may have restarted: the broadcaster's record
   * of "the room has seen this" is about the old server, and keeping it
   * would have the catch-up skip exactly the elements a restart lost.
   */
  const forgetConnection = useCallback(() => {
    selfConnectionIdRef.current = null
    setSelfConnectionId(null)
    pointersRef.current.clear()
    setRoster([])
    // A stale follower set would have every scroll relaying into a room
    // nobody is watching from.
    followRef.current.reset()
    if (fullSyncTimerRef.current !== null) {
      clearTimeout(fullSyncTimerRef.current)
      fullSyncTimerRef.current = null
    }
    broadcasterRef.current = createSceneBroadcaster()
    // Local edits keep landing on the canvas while this is false; they simply
    // aren't offered to the broadcaster until the next SCENE_INIT says what
    // the room already has.
    sceneInitializedRef.current = false
  }, [setRoster])

  // The socket waits for the canvas: a SCENE_INIT with nowhere to put it
  // would leave this tab holding a scene the room has moved past.
  const canvasReady = excalidrawAPI !== null

  useEffect(() => {
    if (!token || !canvasReady) return

    // Shared by every dial in this effect's lifetime, so the wait grows
    // across a whole outage rather than restarting with each attempt.
    const backoff = createReconnectBackoff()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false
    /** The current socket's heartbeat, so unmounting can stop it too. */
    let beat: Heartbeat | null = null
    /**
     * Whether this tab has ever been seated in the room. It is what separates
     * a visitor the cap turned away — who belongs on the "drawing full" page
     * — from a participant whose seat was taken while it was reconnecting,
     * who is holding a scene and must not be sent anywhere (see the close
     * handler).
     */
    let everJoined = false

    const connect = () => {
      const socket = new WebSocket(roomSocketUrl(token, window.location))
      socketRef.current = socket
      beat = createHeartbeat({
        ping: () => send({ type: "PING", payload: {} }),
        // A socket that still says OPEN and answers nothing is a connection
        // that died without a FIN. Closing it is what hands it to the retry
        // below; nothing else would ever notice.
        onSilent: () => socket.close(),
      })
      // Captured, so each socket's handlers stop and answer their own beat
      // rather than whichever one a later dial has installed.
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
            // Send up what this tab has and the room lacks, so both sides merge.
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
        // A close from a socket this effect has finished with says nothing
        // about the connection that is live now. Closes are asynchronous, so
        // navigating from one share link to another can land the old one's
        // close *after* the new socket has joined — and resetting there would
        // wipe the new connection's roster and broadcaster, quietly stopping
        // every local edit from going out until the next reconnect.
        if (disposed || socketRef.current !== socket) return
        socketRef.current = null
        forgetConnection()

        // The cap turned this tab away. Terminal only for a visitor who never
        // got in — for one that had a seat, this is a reconnect arriving
        // before the server let go of its old one, and the "drawing full"
        // page would unmount the canvas and take the scene it drew during the
        // outage with it. So it waits for a seat instead (spec §5.3).
        if (event.code === ROOM_FULL_CLOSE_CODE && !everJoined) {
          onRoomFullRef.current()
          return
        }
        // The link stopped checking out — the one close that must not be
        // retried, or a stopped link would loop until the tab is shut
        // (spec §5.3). Every reconnect goes through the upgrade's
        // re-validation, so this is also how a link killed during an outage
        // is discovered.
        if (event.code === LINK_DEAD_CLOSE_CODE) {
          onLinkDeadRef.current()
          return
        }

        setConnectionStatus("reconnecting")
        retryTimer = setTimeout(connect, backoff.next())
      })
      // An error is always followed by a close event; letting it through
      // unhandled would surface as an unhandled rejection in the console.
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
    token,
    canvasReady,
    send,
    sendScene,
    queueFullSync,
    setRoster,
    pushCollaborators,
    applyRemoteScene,
    forgetConnection,
  ])

  // Rejoining is what re-announces a name, so this only matters while the
  // socket is already open — the guest name pill renaming mid-session.
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

  // Who else is here — the same exclusion the collaborator map makes, so the
  // avatars and the cursors can never disagree about who is remote.
  const others = useMemo(
    () => participants.filter((p) => p.connectionId !== selfConnectionId),
    [participants, selfConnectionId],
  )
  // And the other half of that split: how the room sees this tab — which
  // color its cursor wears, whether it joined as a guest. Null until the
  // join lands. Computed here so no caller has to re-walk the roster and
  // reach a different answer than `others` did.
  const self = useMemo(
    () => participants.find((p) => p.connectionId === selfConnectionId) ?? null,
    [participants, selfConnectionId],
  )

  // Null the moment the followed person leaves — the roster is what the ring
  // and the chip are drawn from, so they can't outlive their subject.
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
