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
import {
  exceedsFrameCap,
  FRAME_TOO_LARGE_CLOSE_CODE,
} from "@/features/collab/frame-cap"
import { resolveRoomJoin } from "@/features/collab/join"
import {
  LINK_DEAD_CLOSE_CODE,
  ROOM_FULL_CLOSE_CODE,
} from "@/features/collab/protocol"
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
import { loadRoomScene } from "@/features/collab/scene-store"
import { resolveShareForRoom } from "@/features/shares/store"
import { allowTokenValidation } from "@/features/shares/token-rate-limit"
import { auth } from "@/lib/auth"

/**
 * Live rooms for this process. In-memory by design (spec §2.3) — the app
 * stays single-replica until a pub/sub backplane is added. Each Room reads
 * the drawing's stored scene once, on the first join.
 */
const rooms = createRoomRegistry((roomId) => loadRoomScene(db, roomId))

/**
 * crossws derives the namespace from the pathname by default, which would
 * key rooms by token — regenerating a link would then split one drawing
 * across two namespaces. The upgrade pins it to the drawing instead, so the
 * pub/sub group and the Room are the same thing.
 */
const namespaceFor = (roomId: string) => `room:${roomId}`

/**
 * Where a refused socket lands for the moment it stays open. Its own
 * namespace, shared with no room: nothing is published into it, and its
 * peers never subscribe to a topic before being closed.
 */
const REFUSED_NAMESPACE = "room:refused"

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

/**
 * The room the upgrade seated this socket in, or null for a socket that
 * belongs in none — refused, or missing the context entirely. Both of those
 * are answered once, in `open`, by closing; every hook after that has a room
 * or has nothing to do.
 */
function roomContextOf(peer: { context: Record<string, unknown> }) {
  const context = peer.context as Partial<{
    roomId: string
    identity: ParticipantIdentity
    refused: true
  }>
  return context.roomId && context.identity
    ? { roomId: context.roomId, identity: context.identity }
    : null
}

const wasRefused = (peer: { context: Record<string, unknown> }) =>
  peer.context.refused === true

export default defineWebSocketHandler({
  async upgrade(request) {
    // Same per-IP budget as the share page's loader, spent before the token
    // is looked up so a reconnect storm costs the database nothing (§4.5).
    // The socket address is srvx's, when the runtime exposes one.
    if (
      !allowTokenValidation({
        headers: request.headers,
        socketIp: (request as { ip?: string }).ip ?? null,
      })
    )
      throw new Response("Too Many Requests", { status: 429 })

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
    // One generic refusal for every reason, like the dead-link page: nothing
    // here reveals whether the drawing exists. The socket is accepted anyway
    // and closed in `open` with a code the client can read — a rejected
    // handshake would arrive as an opaque 1006, which a client reconnecting
    // through an outage (spec §5.3) cannot tell from a server that is down,
    // and would retry against forever.
    if (join.status !== "ok")
      return { namespace: REFUSED_NAMESPACE, context: { refused: true } }

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
    // The dead-link answer of spec §5.3, and the one close the reconnect loop
    // treats as final: retrying a link that is gone would spin forever.
    if (wasRefused(peer))
      return peer.close(LINK_DEAD_CLOSE_CODE, "Link no longer active")

    const context = roomContextOf(peer)
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
    const context = roomContextOf(peer)
    if (!context) return

    // The frame cap of spec §5.4. Measured off the raw frame rather than
    // `text()`, so an oversized payload is not also decoded into a string of
    // its own — though it has been buffered by then either way: neither srvx
    // nor nitro exposes the underlying ws server's `maxPayload`, which is
    // where a cap could refuse the bytes before they are read.
    //
    // The client needs no error channel for it: the close looks like any
    // other drop, and the reconnect's SCENE_INIT puts the session together.
    if (exceedsFrameCap(message.rawData))
      return peer.close(FRAME_TOO_LARGE_CLOSE_CODE, "Frame too large")

    await receiveFromPeer(
      rooms,
      context.roomId,
      toRoomPeer(peer),
      message.text(),
    )
  },

  close(peer) {
    const context = roomContextOf(peer)
    if (!context) return
    leaveRoom(rooms, context.roomId, toRoomPeer(peer))
  },
})
