/**
 * Follow mode. `appState.userToFollow` is the source of truth; a leader relays
 * its viewport only while the server says someone follows it (`FOLLOWED_BY`).
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
  isBackedUp: () => boolean
}) {
  const { excalidrawAPI, send, isBackedUp } = options

  const [followedConnectionId, setFollowedConnectionId] = useState<
    string | null
  >(null)

  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const followedRef = useRef<string | null>(null)
  const followersRef = useRef<ReadonlySet<string>>(new Set())

  // The throttle outlives renders, so it reads `send` through refs.
  const sendRef = useRef(send)
  sendRef.current = send
  const isBackedUpRef = useRef(isBackedUp)
  isBackedUpRef.current = isBackedUp
  const relayViewport = useRef(
    createTrailingThrottle<ClientMessage>(CURSOR_INTERVAL_MS, (message) => {
      // Returning false keeps the trailing frame, so a pan that ends while
      // congested still reaches followers once the buffer drains.
      if (isBackedUpRef.current()) return false
      return sendRef.current(message)
    }),
  )

  // Mutual follows are pruned server-side, per recipient, not here.
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

  // `onScrollChange` doesn't fire on window resize.
  useEffect(() => {
    window.addEventListener("resize", publishViewport)
    return () => {
      window.removeEventListener("resize", publishViewport)
    }
  }, [publishViewport])

  // The only place follow state changes; fires for clicks and native stops alike.
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

  // The `onUserFollow` prop is never called in 0.18; only the API subscription fires.
  useEffect(
    () => excalidrawAPI?.onUserFollow(onUserFollow),
    [excalidrawAPI, onUserFollow],
  )

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
        // A new follower needs a viewport now, not at the next pan.
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
    onScrollChange: publishViewport,
    toggleFollow,
    stopFollowing,
    handleServerMessage,
    reset,
  }
}
