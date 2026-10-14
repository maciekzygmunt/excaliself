// The room websocket. Thin on purpose: the logic lives in `@/features/collab`.

import { defineWebSocketHandler } from "nitro"
import { db } from "@/db"
import {
  exceedsFrameCap,
  FRAME_TOO_LARGE_CLOSE_CODE,
} from "@/features/collab/frame-cap"
import {
  LINK_DEAD_CLOSE_CODE,
  LINK_DEAD_CLOSE_REASON,
  ROOM_FULL_CLOSE_CODE,
  SERVER_RESTART_CLOSE_CODE,
  SERVER_RESTART_CLOSE_REASON,
} from "@/features/collab/protocol"
import { rooms } from "@/features/collab/room-registry"
import type { ParticipantIdentity } from "@/features/collab/room-session"
import {
  joinRoom,
  leaveRoom,
  receiveFromPeer,
} from "@/features/collab/room-session"
import { resolveRoomForToken } from "@/features/collab/room-token"
import {
  recordFailedTokenLookup,
  tokenLookupsBlocked,
} from "@/features/shares/token-rate-limit"
import { socketIpOf } from "@/lib/client-ip"

/** Keyed by drawing, not crossws's default pathname, so a new token keeps the room. */
const namespaceFor = (roomId: string) => `room:${roomId}`

/** Nitro's route params don't reach ws hooks; tokens are hex, so no decoding. */
const tokenOf = (request: Request) =>
  new URL(request.url).pathname.split("/").pop() || ""

function roomContextOf(peer: { context: Record<string, unknown> }) {
  const { roomId, identity } = peer.context as Partial<{
    roomId: string
    identity: ParticipantIdentity
  }>
  return roomId && identity ? { roomId, identity } : null
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const visitor = { headers: request.headers, socketIp: socketIpOf(request) }
    if (tokenLookupsBlocked(visitor))
      throw new Response("Too Many Requests", { status: 429 })

    // Runs on every (re)connect, so link changes apply on the next join.
    const join = await resolveRoomForToken(
      db,
      tokenOf(request),
      request.headers,
    )
    // Accept and close in `open`: a refused handshake is an opaque 1006 the
    // client can't tell from an outage, so it would retry forever.
    if (join.status !== "ok") {
      recordFailedTokenLookup(visitor)
      return
    }

    return {
      namespace: namespaceFor(join.roomId),
      context: {
        roomId: join.roomId,
        identity: join.identity,
      },
    }
  },

  // Frames keep their order: all queue behind the same Room load promise.
  async open(peer) {
    // The one close the client's reconnect loop treats as final.
    const context = roomContextOf(peer)
    if (!context)
      return peer.close(LINK_DEAD_CLOSE_CODE, LINK_DEAD_CLOSE_REASON)

    // Seat first, then check the link again. A link that died during the
    // handshake either fails this check or finds the seat to evict.
    const joining = joinRoom(rooms, context.roomId, peer, context.identity)
    const recheck = await resolveRoomForToken(
      db,
      tokenOf(peer.request),
      peer.request.headers,
    )
    if (recheck.status !== "ok" || recheck.roomId !== context.roomId) {
      await leaveRoom(rooms, context.roomId, peer)
      return peer.close(LINK_DEAD_CLOSE_CODE, LINK_DEAD_CLOSE_REASON)
    }
    // The cap is checked here, not at the upgrade: a refused handshake
    // reaches the browser as an opaque 1006.
    const { status } = await joining
    if (status === "full") peer.close(ROOM_FULL_CLOSE_CODE, "Room full")
    if (status === "closing")
      peer.close(SERVER_RESTART_CLOSE_CODE, SERVER_RESTART_CLOSE_REASON)
  },

  async message(peer, message) {
    const context = roomContextOf(peer)
    if (!context) return

    // Raw frame, so it isn't decoded too. The build sets ws `maxPayload` to
    // the same cap (vite.config.ts), so ws refuses first; this is the fallback.
    if (exceedsFrameCap(message.rawData))
      return peer.close(FRAME_TOO_LARGE_CLOSE_CODE, "Frame too large")

    const outcome = await receiveFromPeer(
      rooms,
      context.roomId,
      peer,
      message.text(),
    )
    // Seat swept while the socket stayed open: close so the client rejoins.
    if (outcome === "evicted") peer.close(1000, "Rejoin")
  },

  // The last one out waits for the Room's final write.
  async close(peer) {
    const context = roomContextOf(peer)
    if (!context) return
    await leaveRoom(rooms, context.roomId, peer)
  },
})
