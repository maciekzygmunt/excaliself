/**
 * Room presence: who is connected to a shared drawing right now, and the
 * relaying of their cursors (canvas sharing spec §2.1–§2.2).
 *
 * Deliberately free of crossws and nitro imports — it talks to a {@link RoomPeer}
 * interface the websocket route adapts a real peer to. That keeps the whole
 * join/relay/leave cycle drivable from unit tests, which is the only place
 * multi-peer behavior can be checked without standing up a server.
 *
 * The authoritative scene and its flush to the database are the next slices;
 * a Room here holds nothing but its participants and who is following whom.
 */

import { guestNameForConnection, pickParticipantColor } from "./identity"
import type { Participant, ServerMessage } from "./protocol"
import { parseClientMessage, ROOM_TOPIC } from "./protocol"

/** The slice of a crossws `Peer` the room logic uses. */
export interface RoomPeer {
  /** crossws mints a random uuid per socket — the connection id of spec §4.4. */
  readonly id: string
  send(data: ServerMessage): void
  /** Fans out to the rest of the namespace; never echoes to the sender. */
  publish(topic: string, data: ServerMessage): void
  subscribe(topic: string): void
}

/**
 * What the upgrade hook established about the socket. `userId` is null for
 * guests — the one thing that decides whether a name from the wire is
 * believed.
 */
export type ParticipantIdentity = {
  userId: string | null
  displayName: string | null
}

export type Room = {
  participants: Map<string, Participant>
  /**
   * The live socket behind each participant. Follow mode is the first thing
   * here that has to reach one named peer rather than the whole room, and
   * the pub/sub topic can only do the latter.
   */
  peers: Map<string, RoomPeer>
  /** Follower connection id → the connection id it is trailing (spec §1.3). */
  follows: Map<string, string>
}

/**
 * Live rooms, keyed by drawing id — one Room per Drawing. In-memory per
 * process, so the app stays single-replica (spec §2.3).
 */
export type RoomRegistry = Map<string, Room>

export function createRoomRegistry(): RoomRegistry {
  return new Map()
}

function rosterOf(room: Room): Participant[] {
  return [...room.participants.values()]
}

const rosterMessage = (room: Room): ServerMessage => ({
  type: "PARTICIPANTS",
  payload: { participants: rosterOf(room) },
})

/** To the peer itself, and to everyone else via the room topic. */
function broadcastRoster(peer: RoomPeer, room: Room) {
  const message = rosterMessage(room)
  peer.send(message)
  peer.publish(ROOM_TOPIC, message)
}

export function joinRoom(
  rooms: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  identity: ParticipantIdentity,
) {
  let room = rooms.get(roomId)
  if (!room) {
    room = { participants: new Map(), peers: new Map(), follows: new Map() }
    rooms.set(roomId, room)
  }

  const isGuest = identity.userId === null
  const participant: Participant = {
    connectionId: peer.id,
    // A guest wears a server-side pseudonym until its JOIN arrives, so it is
    // never nameless in the roster; a member's name comes from the session.
    name: identity.displayName?.trim() || guestNameForConnection(peer.id),
    color: pickParticipantColor(rosterOf(room).map((p) => p.color)),
    isGuest,
  }
  room.participants.set(peer.id, participant)
  room.peers.set(peer.id, peer)

  peer.subscribe(ROOM_TOPIC)
  peer.send({
    type: "ROOM_JOINED",
    payload: { connectionId: peer.id, participants: rosterOf(room) },
  })
  peer.publish(ROOM_TOPIC, rosterMessage(room))
}

const followersOf = (room: Room, followedId: string) =>
  [...room.follows.entries()]
    .filter(([, followed]) => followed === followedId)
    .map(([follower]) => follower)

/**
 * Everyone this peer is trailing, directly or down the chain. A viewport
 * must never be relayed back into it: A→B→C→A would hand each peer bounds
 * that move its canvas, which publishes bounds of its own, forever. Walking
 * the whole chain rather than checking the one reciprocal edge is what makes
 * that true for rings of any size.
 *
 * A chain is at most as long as the room, and the visited set means a cycle
 * already in the map (one built before this guard existed, say) terminates
 * the walk rather than hanging it.
 */
function upstreamOf(room: Room, peerId: string): Set<string> {
  const upstream = new Set<string>()
  let cursor = room.follows.get(peerId)
  while (cursor && !upstream.has(cursor)) {
    upstream.add(cursor)
    cursor = room.follows.get(cursor)
  }
  return upstream
}

/**
 * Tell one peer who is currently trailing it. That list is what decides
 * whether it relays its viewport at all, so a peer nobody follows stays
 * silent.
 */
function sendFollowedBy(room: Room, followedId: string) {
  room.peers.get(followedId)?.send({
    type: "FOLLOWED_BY",
    payload: { connectionIds: followersOf(room, followedId) },
  })
}

function setFollowTarget(
  room: Room,
  followerId: string,
  target: string | null,
) {
  // Following yourself or someone who isn't in the room means "nobody" —
  // the alternative is a client able to plant unreachable entries in the map.
  const followed =
    target && target !== followerId && room.participants.has(target)
      ? target
      : null
  const previous = room.follows.get(followerId) ?? null
  if (previous === followed) return

  if (followed) room.follows.set(followerId, followed)
  else room.follows.delete(followerId)

  if (previous) sendFollowedBy(room, previous)
  if (followed) sendFollowedBy(room, followed)
}

export function receiveFromPeer(
  rooms: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  raw: string,
) {
  const room = rooms.get(roomId)
  const participant = room?.participants.get(peer.id)
  if (!room || !participant) return

  const message = parseClientMessage(raw)
  if (!message) return

  if (message.type === "JOIN") {
    // Only guests name themselves. A member's name is whatever the session
    // says, so a compromised client can't pose as someone else in the room.
    if (!participant.isGuest || participant.name === message.payload.name)
      return
    room.participants.set(peer.id, {
      ...participant,
      name: message.payload.name,
    })
    broadcastRoster(peer, room)
    return
  }

  if (message.type === "USER_FOLLOW") {
    setFollowTarget(room, peer.id, message.payload.followedConnectionId)
    return
  }

  if (message.type === "USER_VISIBLE_SCENE_BOUNDS") {
    const upstream = upstreamOf(room, peer.id)
    for (const followerId of followersOf(room, peer.id)) {
      // Only the edges that would close a loop are dropped; anyone else
      // trailing this peer still gets the viewport. A plain chain — C follows
      // A, A follows B — is not a loop and keeps working.
      if (upstream.has(followerId)) continue
      room.peers.get(followerId)?.send({
        type: "USER_VISIBLE_SCENE_BOUNDS",
        payload: { connectionId: peer.id, bounds: message.payload.bounds },
      })
    }
    return
  }

  peer.publish(ROOM_TOPIC, {
    type: "MOUSE_LOCATION",
    payload: { ...message.payload, connectionId: peer.id },
  })
}

export function leaveRoom(rooms: RoomRegistry, roomId: string, peer: RoomPeer) {
  const room = rooms.get(roomId)
  if (!room?.participants.delete(peer.id)) return
  room.peers.delete(peer.id)

  // A departing peer both stops following and stops being followed. Its own
  // followers need no message — Excalidraw drops `userToFollow` by itself
  // once the followed collaborator falls out of the roster.
  const wasFollowing = room.follows.get(peer.id) ?? null
  room.follows.delete(peer.id)
  for (const followerId of followersOf(room, peer.id))
    room.follows.delete(followerId)
  if (wasFollowing) sendFollowedBy(room, wasFollowing)

  // Nothing is holding the Room open once its last socket goes (spec §2.5);
  // the flush that has to happen first arrives with the persistence slice.
  if (room.participants.size === 0) {
    rooms.delete(roomId)
    return
  }
  peer.publish(ROOM_TOPIC, rosterMessage(room))
}
