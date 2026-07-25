/**
 * The room websocket (canvas sharing spec §2.1). One in-process nitro handler
 * on the app's own port — no new ports, no new env vars.
 *
 * This file is deliberately thin: it adapts a crossws peer to the
 * {@link RoomPeer} interface and does the two lookups the upgrade decision
 * needs. Everything else lives in `@/features/collab`, where it is unit
 * tested without a server.
 */

import { defineWebSocketHandler } from "nitro"
import { db } from "@/db"
import { ROOM_FULL_CLOSE_CODE } from "@/features/collab/protocol"
import type {
  ParticipantIdentity,
  RoomPeer,
} from "@/features/collab/room-session"
import {
  createRoomRegistry,
  joinRoom,
  leaveRoom,
  receiveFromPeer,
} from "@/features/collab/room-session"
import { resolveRoomForToken } from "@/features/collab/room-token"
import { loadRoomScene } from "@/features/collab/scene-store"
import { allowTokenValidation } from "@/features/shares/token-rate-limit"
import { socketIpOf } from "@/lib/client-ip"

/**
 * Live rooms for this process. In-memory by design (spec §2.3) — the app
 * stays single-replica until a pub/sub backplane is added. Each Room reads
 * the drawing's stored scene once, on the first join.
 */
const rooms = createRoomRegistry((roomId) => loadRoomScene(db, roomId))

type PeerContext = { roomId: string; identity: ParticipantIdentity }

/**
 * crossws derives the namespace from the pathname by default, which would
 * key rooms by token — regenerating a link would then split one drawing
 * across two namespaces. The upgrade pins it to the drawing instead, so the
 * pub/sub group and the Room are the same thing.
 */
const namespaceFor = (roomId: string) => `room:${roomId}`

/** crossws peers already carry a random per-socket id — the connection id. */
function toRoomPeer(peer: {
  id: string
  send: (data: unknown) => unknown
  publish: (topic: string, data: unknown) => unknown
  subscribe: (topic: string) => unknown
}): RoomPeer {
  return {
    id: peer.id,
    send: (data) => {
      peer.send(data)
    },
    publish: (topic, data) => {
      peer.publish(topic, data)
    },
    subscribe: (topic) => {
      peer.subscribe(topic)
    },
  }
}

function contextOf(peer: { context: Record<string, unknown> }) {
  const context = peer.context as Partial<PeerContext>
  return context.roomId && context.identity
    ? { roomId: context.roomId, identity: context.identity }
    : null
}

export default defineWebSocketHandler({
  async upgrade(request) {
    // Same per-IP budget as the share page's loader, spent before the token
    // is looked up so a reconnect storm costs the database nothing (§4.5).
    // The socket address is srvx's, when the runtime exposes one.
    if (
      !allowTokenValidation({
        headers: request.headers,
        socketIp: socketIpOf(request),
      })
    )
      throw new Response("Too Many Requests", { status: 429 })

    // The path is `/ws/rooms/<token>`; nitro's route params aren't exposed to
    // the upgrade hook, so read the token off the URL directly.
    const token = decodeURIComponent(
      new URL(request.url).pathname.split("/").pop() || "",
    )

    // Runs on every (re)connect, so stop, regenerate, an audience tighten,
    // and trash all take effect on the next join (spec §4.1). The room-scoped
    // image endpoints call the same function, so the token, audience and
    // deletedAt decision is literally shared — the per-IP budget above is not,
    // and `$fileId.ts` says why.
    const join = await resolveRoomForToken(db, token, request.headers)
    // One generic refusal for every reason, like the dead-link page: a
    // rejected upgrade never reveals whether the drawing exists.
    if (join.status !== "ok")
      throw new Response("Unauthorized", { status: 401 })

    return {
      namespace: namespaceFor(join.roomId),
      context: { roomId: join.roomId, identity: join.identity },
    }
  },

  // Both hooks are async because a Room may still be reading its scene. Frame
  // order survives that either way: everything queues behind the same load
  // promise, and continuations on a settled promise run in the order they
  // were registered.
  async open(peer) {
    const context = contextOf(peer)
    if (!context) return peer.close(1011, "Room unavailable")
    const join = await joinRoom(
      rooms,
      context.roomId,
      toRoomPeer(peer),
      context.identity,
    )
    // The cap is enforced here rather than at the upgrade because a refused
    // handshake reaches the browser as an opaque 1006; a close code the page
    // can read is what turns this into the "drawing full" state.
    if (join.status === "full") peer.close(ROOM_FULL_CLOSE_CODE, "Room full")
  },

  async message(peer, message) {
    const context = contextOf(peer)
    if (!context) return
    await receiveFromPeer(
      rooms,
      context.roomId,
      toRoomPeer(peer),
      message.text(),
    )
  },

  close(peer) {
    const context = contextOf(peer)
    if (!context) return
    leaveRoom(rooms, context.roomId, toRoomPeer(peer))
  },
})
