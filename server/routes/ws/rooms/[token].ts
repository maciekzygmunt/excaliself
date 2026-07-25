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
import { resolveRoomJoin } from "@/features/collab/join"
import type { PeerIdentity, RoomPeer } from "@/features/collab/room-session"
import {
  createRoomRegistry,
  joinRoom,
  leaveRoom,
  receiveFromPeer,
} from "@/features/collab/room-session"
import { resolveShareForRoom } from "@/features/shares/store"
import { auth } from "@/lib/auth"

/**
 * Live rooms for this process. In-memory by design (spec §2.3) — the app
 * stays single-replica until a pub/sub backplane is added.
 */
const rooms = createRoomRegistry()

type PeerContext = { roomId: string; identity: PeerIdentity }

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
    // The path is `/ws/rooms/<token>`; nitro's route params aren't exposed to
    // the upgrade hook, so read the token off the URL directly.
    const token = decodeURIComponent(
      new URL(request.url).pathname.split("/").pop() || "",
    )

    // Both checks run on every (re)connect, so stop, regenerate, an audience
    // tighten, and trash all take effect on the next join (spec §4.1).
    const [share, session] = await Promise.all([
      token ? resolveShareForRoom(db, token) : null,
      auth.api.getSession({ headers: request.headers }),
    ])

    const join = resolveRoomJoin({ share, user: session?.user ?? null })
    // One generic refusal for every reason, like the dead-link page: a
    // rejected upgrade never reveals whether the drawing exists.
    if (join.status !== "ok")
      throw new Response("Unauthorized", { status: 401 })

    return {
      namespace: namespaceFor(join.roomId),
      context: { roomId: join.roomId, identity: join.identity },
    }
  },

  open(peer) {
    const context = contextOf(peer)
    if (!context) return peer.close(1011, "Room unavailable")
    joinRoom(rooms, context.roomId, toRoomPeer(peer), context.identity)
  },

  message(peer, message) {
    const context = contextOf(peer)
    if (!context) return
    receiveFromPeer(rooms, context.roomId, toRoomPeer(peer), message.text())
  },

  close(peer) {
    const context = contextOf(peer)
    if (!context) return
    leaveRoom(rooms, context.roomId, toRoomPeer(peer))
  },
})
