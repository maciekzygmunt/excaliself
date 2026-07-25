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
 * a Room here holds nothing but its participants.
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
export type PeerIdentity = {
  userId: string | null
  displayName: string | null
}

export type Room = { participants: Map<string, Participant> }

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

/** To the joiner directly, and to everyone else via the room topic. */
function broadcastRoster(peer: RoomPeer, room: Room) {
  const message: ServerMessage = {
    type: "PARTICIPANTS",
    payload: { participants: rosterOf(room) },
  }
  peer.send(message)
  peer.publish(ROOM_TOPIC, message)
}

export function joinRoom(
  rooms: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  identity: PeerIdentity,
) {
  let room = rooms.get(roomId)
  if (!room) {
    room = { participants: new Map() }
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

  peer.subscribe(ROOM_TOPIC)
  peer.send({
    type: "ROOM_JOINED",
    payload: { connectionId: peer.id, participants: rosterOf(room) },
  })
  peer.publish(ROOM_TOPIC, {
    type: "PARTICIPANTS",
    payload: { participants: rosterOf(room) },
  })
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

  peer.publish(ROOM_TOPIC, {
    type: "MOUSE_LOCATION",
    payload: { ...message.payload, connectionId: peer.id },
  })
}

export function leaveRoom(rooms: RoomRegistry, roomId: string, peer: RoomPeer) {
  const room = rooms.get(roomId)
  if (!room?.participants.delete(peer.id)) return

  // Nothing is holding the Room open once its last socket goes (spec §2.5);
  // the flush that has to happen first arrives with the persistence slice.
  if (room.participants.size === 0) {
    rooms.delete(roomId)
    return
  }
  peer.publish(ROOM_TOPIC, {
    type: "PARTICIPANTS",
    payload: { participants: rosterOf(room) },
  })
}
