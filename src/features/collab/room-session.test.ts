import { expect, test } from "vitest"
import { guestNameForConnection } from "./identity"
import type { ServerMessage } from "./protocol"
import { ROOM_TOPIC } from "./protocol"
import {
  createRoomRegistry,
  joinRoom,
  leaveRoom,
  type RoomPeer,
  receiveFromPeer,
} from "./room-session"

const ROOM = "drawing-1"

/** Stands in for a crossws Peer: records what it was sent and what it fanned out. */
function fakePeer(id: string) {
  const sent: ServerMessage[] = []
  const published: { topic: string; data: ServerMessage }[] = []
  const topics: string[] = []
  const peer: RoomPeer & {
    sent: ServerMessage[]
    published: typeof published
    topics: string[]
  } = {
    id,
    sent,
    published,
    topics,
    send: (data) => {
      sent.push(data)
    },
    publish: (topic, data) => {
      published.push({ topic, data })
    },
    subscribe: (topic) => {
      topics.push(topic)
    },
  }
  return peer
}

const member = (displayName: string) => ({
  userId: `u:${displayName}`,
  displayName,
})
const guest = { userId: null, displayName: null }

const rosterOf = (message: ServerMessage | undefined) =>
  message && "participants" in message.payload
    ? message.payload.participants.map((p) => p.name)
    : undefined

test("the joiner learns its own connection id and the room it walked into", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, member("Ada"))

  expect(ada.topics).toEqual([ROOM_TOPIC])
  expect(ada.sent[0]).toMatchObject({
    type: "ROOM_JOINED",
    payload: { connectionId: "peer-ada" },
  })
  expect(rosterOf(ada.sent[0])).toEqual(["Ada"])
})

test("a second peer sees the first, and the first is told about the second", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  joinRoom(rooms, ROOM, ada, member("Ada"))
  joinRoom(rooms, ROOM, grace, member("Grace"))

  expect(rosterOf(grace.sent[0])).toEqual(["Ada", "Grace"])
  // Grace's join fans the new roster out to everyone else in the room.
  expect(grace.published).toHaveLength(1)
  expect(grace.published[0].topic).toBe(ROOM_TOPIC)
  expect(grace.published[0].data.type).toBe("PARTICIPANTS")
  expect(rosterOf(grace.published[0].data)).toEqual(["Ada", "Grace"])
})

test("members arrive under their display name; guests under a pseudonym", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  const visitor = fakePeer("peer-visitor")
  joinRoom(rooms, ROOM, ada, member("Ada"))
  joinRoom(rooms, ROOM, visitor, guest)

  expect(rosterOf(visitor.sent[0])).toEqual([
    "Ada",
    guestNameForConnection("peer-visitor"),
  ])
})

test("a guest's JOIN adopts the name it kept locally", () => {
  const rooms = createRoomRegistry()
  const visitor = fakePeer("peer-visitor")
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, visitor, guest)
  joinRoom(rooms, ROOM, ada, member("Ada"))

  receiveFromPeer(
    rooms,
    ROOM,
    visitor,
    JSON.stringify({ type: "JOIN", payload: { name: "Wren" } }),
  )

  expect(rosterOf(visitor.published.at(-1)?.data)).toEqual(["Wren", "Ada"])
  expect(rosterOf(visitor.sent.at(-1))).toEqual(["Wren", "Ada"])
})

test("a member cannot rename itself over the wire — the session name stands", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, member("Ada"))
  ada.published.length = 0

  receiveFromPeer(
    rooms,
    ROOM,
    ada,
    JSON.stringify({ type: "JOIN", payload: { name: "Administrator" } }),
  )

  expect(ada.published).toHaveLength(0)
  expect(rosterOf(ada.sent[0])).toEqual(["Ada"])
})

test("everyone in a room wears a different color", () => {
  const rooms = createRoomRegistry()
  const peers = ["a", "b", "c"].map((id) => fakePeer(id))
  for (const peer of peers) joinRoom(rooms, ROOM, peer, guest)

  const roster = rooms.get(ROOM)
  const colors = [...(roster?.participants.values() ?? [])].map(
    (p) => p.color.background,
  )
  expect(new Set(colors).size).toBe(3)
})

test("a cursor is relayed to the rest of the room, stamped with its sender", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, member("Ada"))

  receiveFromPeer(
    rooms,
    ROOM,
    ada,
    JSON.stringify({
      type: "MOUSE_LOCATION",
      payload: {
        pointer: { x: 4, y: 8, tool: "pointer" },
        button: "up",
        selectedElementIds: {},
      },
    }),
  )

  // publish() never echoes to the sender, so nothing lands back in ada.sent.
  expect(ada.sent).toHaveLength(1)
  expect(ada.published.at(-1)).toEqual({
    topic: ROOM_TOPIC,
    data: {
      type: "MOUSE_LOCATION",
      payload: {
        connectionId: "peer-ada",
        pointer: { x: 4, y: 8, tool: "pointer" },
        button: "up",
        selectedElementIds: {},
      },
    },
  })
})

test("garbage from a peer is dropped, not relayed", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, guest)
  ada.published.length = 0

  receiveFromPeer(rooms, ROOM, ada, "}{")
  receiveFromPeer(rooms, ROOM, ada, '{"type":"SCENE_UPDATE","payload":{}}')

  expect(ada.published).toHaveLength(0)
})

test("a message from a peer that never joined is ignored", () => {
  const rooms = createRoomRegistry()
  const stranger = fakePeer("peer-stranger")

  receiveFromPeer(
    rooms,
    ROOM,
    stranger,
    JSON.stringify({ type: "JOIN", payload: { name: "Wren" } }),
  )

  expect(stranger.published).toHaveLength(0)
  expect(rooms.has(ROOM)).toBe(false)
})

test("leaving drops the participant and tells the rest", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  joinRoom(rooms, ROOM, ada, member("Ada"))
  joinRoom(rooms, ROOM, grace, member("Grace"))

  leaveRoom(rooms, ROOM, grace)

  expect(rosterOf(grace.published.at(-1)?.data)).toEqual(["Ada"])
  expect(rooms.get(ROOM)?.participants.size).toBe(1)
})

test("the last peer out takes the room with it", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, member("Ada"))

  leaveRoom(rooms, ROOM, ada)

  expect(rooms.has(ROOM)).toBe(false)
})

test("leaving twice is harmless", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  joinRoom(rooms, ROOM, ada, member("Ada"))

  leaveRoom(rooms, ROOM, ada)
  expect(() => leaveRoom(rooms, ROOM, ada)).not.toThrow()
})

test("rooms are isolated — a peer only ever sees its own drawing's roster", () => {
  const rooms = createRoomRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  joinRoom(rooms, "drawing-1", ada, member("Ada"))
  joinRoom(rooms, "drawing-2", grace, member("Grace"))

  expect(rosterOf(grace.sent[0])).toEqual(["Grace"])
  expect(rooms.get("drawing-1")?.participants.size).toBe(1)
  expect(rooms.get("drawing-2")?.participants.size).toBe(1)
})
