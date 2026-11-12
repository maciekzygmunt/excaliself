/**
 * Follow mode. This hook owns who is followed; the canvas gets it as its
 * `userToFollow` prop and reports back when a pan or zoom ends the follow. A
 * leader relays its viewport only while the server says someone follows it
 * (`FOLLOWED_BY`).
 */

import { getVisibleSceneBounds, zoomToFitBounds } from "@excalidraw/excalidraw"
import type {
  ExcalidrawImperativeAPI,
  OnUserFollowedPayload,
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

  const setFollowed = useCallback((next: string | null) => {
    if (followedRef.current === next) return
    followedRef.current = next
    setFollowedConnectionId(next)
    sendRef.current({
      type: "USER_FOLLOW",
      payload: { followedConnectionId: next },
    })
  }, [])

  // The canvas asks to stop when the user pans or zooms away.
  const onUserFollow = useCallback(
    (payload: OnUserFollowedPayload) => {
      const { socketId } = payload.userToFollow
      if (payload.action === "FOLLOW") setFollowed(socketId)
      // An unfollow of someone no longer followed is stale.
      else if (followedRef.current === socketId) setFollowed(null)
    },
    [setFollowed],
  )

  useEffect(
    () => excalidrawAPI?.onUserFollow(onUserFollow),
    [excalidrawAPI, onUserFollow],
  )

  const toggleFollow = useCallback(
    (participant: Participant) => {
      const alreadyFollowing = followedRef.current === participant.connectionId
      setFollowed(alreadyFollowing ? null : participant.connectionId)
    },
    [setFollowed],
  )

  const stopFollowing = useCallback(() => setFollowed(null), [setFollowed])

  const handleServerMessage = useCallback(
    (message: FollowMessage) => {
      const api = apiRef.current

      if (message.type === "FOLLOWED_BY") {
        followersRef.current = new Set(message.payload.connectionIds)
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
            fit: "contain",
          }).appState,
        })
      }
    },
    [publishViewport],
  )

  const reset = useCallback(() => {
    followersRef.current = new Set()
    relayViewport.current.cancel()
    // No message: the socket this follow lived on is gone.
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
