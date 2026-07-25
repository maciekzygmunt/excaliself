/**
 * Follow mode's client half (spec §1.3): click someone's avatar and your
 * canvas rides along with theirs until you pan, zoom, or click the chip.
 *
 * The mechanics are Excalidraw's own — `appState.userToFollow` is the single
 * source of truth, and the package already handles the awkward parts:
 * dragging the canvas drops the follow, and so does the followed person
 * leaving the room. This hook only listens for the resulting FOLLOW/UNFOLLOW
 * and keeps the room in the loop.
 *
 * That listening goes through `excalidrawAPI.onUserFollow`, not the
 * `onUserFollow` prop: the prop is declared in 0.18's types but nothing in
 * the package ever calls it, so only the imperative subscription fires.
 *
 * Viewports travel peer-to-peer rather than by broadcast: the server tells a
 * peer who is trailing it (`FOLLOWED_BY`), and only then does it relay its
 * visible bounds — a room where nobody follows anybody carries no viewport
 * traffic at all.
 */

import { getVisibleSceneBounds, zoomToFitBounds } from "@excalidraw/excalidraw"
import type {
  ExcalidrawImperativeAPI,
  OnUserFollowedPayload,
  SocketId,
} from "@excalidraw/excalidraw/types"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientMessage, Participant, ServerMessage } from "./protocol"
import { CURSOR_INTERVAL_MS, createTrailingThrottle } from "./throttle"

type FollowMessage = Extract<
  ServerMessage,
  { type: "FOLLOWED_BY" | "USER_VISIBLE_SCENE_BOUNDS" }
>

export function useFollow(options: {
  excalidrawAPI: ExcalidrawImperativeAPI | null
  send: (message: ClientMessage) => boolean
}) {
  const { excalidrawAPI, send } = options

  const [followedConnectionId, setFollowedConnectionId] = useState<
    string | null
  >(null)

  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const followedRef = useRef<string | null>(null)
  /** Who is trailing us, straight off the wire — never rendered here. */
  const followersRef = useRef<ReadonlySet<string>>(new Set())

  // The throttle outlives any one render, so it reaches the socket through a
  // ref rather than closing over the `send` it happened to be built with.
  const sendRef = useRef(send)
  sendRef.current = send
  const relayViewport = useRef(
    createTrailingThrottle<ClientMessage>(CURSOR_INTERVAL_MS, (message) => {
      sendRef.current(message)
    }),
  )

  /**
   * Hand our viewport to whoever is trailing us. Mutual follows are pruned
   * server-side, per recipient — suppressing the whole relay here would
   * strand any third peer following us as well.
   */
  const publishViewport = useCallback(() => {
    const api = apiRef.current
    if (!api || followersRef.current.size === 0) return
    relayViewport.current.push({
      type: "USER_VISIBLE_SCENE_BOUNDS",
      payload: { bounds: getVisibleSceneBounds(api.getAppState()) },
    })
  }, [])

  useEffect(() => {
    const throttle = relayViewport.current
    return () => {
      throttle.cancel()
    }
  }, [])

  // Bounds move with the window as well as with the canvas, and Excalidraw's
  // `onScrollChange` only fires for the latter — without this a leader who
  // resizes leaves their followers parked on stale bounds until the next pan.
  useEffect(() => {
    window.addEventListener("resize", publishViewport)
    return () => {
      window.removeEventListener("resize", publishViewport)
    }
  }, [publishViewport])

  /**
   * The one place follow state changes. Excalidraw fires this both for our
   * own avatar clicks and for the interruptions it handles natively, so the
   * server hears about every stop, however it came about.
   */
  const onUserFollow = useCallback((payload: OnUserFollowedPayload) => {
    const next =
      payload.action === "FOLLOW" ? payload.userToFollow.socketId : null
    // A switch from A to B arrives as UNFOLLOW(A) then FOLLOW(B); ignore
    // the stale unfollow so it can't cancel the follow that replaced it.
    if (
      payload.action === "UNFOLLOW" &&
      followedRef.current !== payload.userToFollow.socketId
    )
      return
    followedRef.current = next
    setFollowedConnectionId(next)
    sendRef.current({
      type: "USER_FOLLOW",
      payload: { followedConnectionId: next },
    })
  }, [])

  useEffect(
    () => excalidrawAPI?.onUserFollow(onUserFollow),
    [excalidrawAPI, onUserFollow],
  )

  /** Clicking the avatar of the person you are already following stops. */
  const toggleFollow = useCallback((participant: Participant) => {
    const api = apiRef.current
    if (!api) return
    const alreadyFollowing = followedRef.current === participant.connectionId
    api.updateScene({
      appState: {
        userToFollow: alreadyFollowing
          ? null
          : {
              socketId: participant.connectionId as SocketId,
              username: participant.name,
            },
      },
    })
  }, [])

  const stopFollowing = useCallback(() => {
    apiRef.current?.updateScene({ appState: { userToFollow: null } })
  }, [])

  /** The two follow-mode frames; `use-room` routes the rest. */
  const handleServerMessage = useCallback(
    (message: FollowMessage) => {
      const api = apiRef.current

      if (message.type === "FOLLOWED_BY") {
        followersRef.current = new Set(message.payload.connectionIds)
        api?.updateScene({
          appState: {
            followedBy: new Set(message.payload.connectionIds as SocketId[]),
          },
        })
        // A new follower is waiting on a viewport that may not come for a
        // while, so send one now instead of leaving them on their own canvas.
        publishViewport()
        return
      }

      if (message.type === "USER_VISIBLE_SCENE_BOUNDS") {
        if (!api || message.payload.connectionId !== followedRef.current) return
        api.updateScene({
          appState: zoomToFitBounds({
            appState: api.getAppState(),
            bounds: message.payload.bounds,
            fitToViewport: true,
            viewportZoomFactor: 1,
          }).appState,
        })
      }
    },
    [publishViewport],
  )

  /** A dropped socket ends every arrangement it was carrying. */
  const reset = useCallback(() => {
    followersRef.current = new Set()
    relayViewport.current.cancel()
    apiRef.current?.updateScene({
      appState: { userToFollow: null, followedBy: new Set() },
    })
    followedRef.current = null
    setFollowedConnectionId(null)
  }, [])

  return {
    followedConnectionId,
    /** Wire straight to Excalidraw's `onScrollChange` prop. */
    onScrollChange: publishViewport,
    toggleFollow,
    stopFollowing,
    handleServerMessage,
    reset,
  }
}
