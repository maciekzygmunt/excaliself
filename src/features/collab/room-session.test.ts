import { expect, test } from "vitest"
import { guestNameForConnection } from "./identity"
import type { SceneElement, ServerMessage } from "./protocol"
import { ROOM_TOPIC } from "./protocol"
import {
  createRoomRegistry,
  joinRoom,
  leaveRoom,
  MAX_ROOM_PARTICIPANTS,
  type RoomPeer,
  type RoomRegistry,
  receiveFromPeer,
  type SceneLoader,
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

/** A registry over an empty stored drawing — the presence tests' default. */
const emptyRegistry = (load?: SceneLoader) =>
  createRoomRegistry(load ?? (async () => ({ elements: [], ownerId: null })))

const member = (displayName: string) => ({
  userId: `u:${displayName}`,
  displayName,
})
const guest = { userId: null, displayName: null }

const rosterOf = (message: ServerMessage | undefined) =>
  message && "participants" in message.payload
    ? message.payload.participants.map((p) => p.name)
    : undefined

const framesOf = (peer: ReturnType<typeof fakePeer>, type: string) =>
  peer.sent.filter((message) => message.type === type)

const elementsOf = (message: ServerMessage | undefined) =>
  message && "elements" in message.payload
    ? message.payload.elements
    : undefined

function element(
  id: string,
  version: number,
  extra: Partial<SceneElement> = {},
): SceneElement {
  return { id, version, versionNonce: 1, index: "a0", ...extra }
}

const sceneUpdate = (elements: SceneElement[]) =>
  JSON.stringify({ type: "SCENE_UPDATE", payload: { elements } })

test("the joiner learns its own connection id and the room it walked into", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  expect(ada.topics).toEqual([ROOM_TOPIC])
  expect(ada.sent[0]).toMatchObject({
    type: "ROOM_JOINED",
    payload: { connectionId: "peer-ada" },
  })
  expect(rosterOf(ada.sent[0])).toEqual(["Ada"])
})

test("a second peer sees the first, and the first is told about the second", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await joinRoom(registry, ROOM, grace, member("Grace"))

  expect(rosterOf(grace.sent[0])).toEqual(["Ada", "Grace"])
  // Grace's join fans the new roster out to everyone else in the room.
  expect(grace.published).toHaveLength(1)
  expect(grace.published[0].topic).toBe(ROOM_TOPIC)
  expect(grace.published[0].data.type).toBe("PARTICIPANTS")
  expect(rosterOf(grace.published[0].data)).toEqual(["Ada", "Grace"])
})

test("members arrive under their display name; guests under a pseudonym", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const visitor = fakePeer("peer-visitor")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await joinRoom(registry, ROOM, visitor, guest)

  expect(rosterOf(visitor.sent[0])).toEqual([
    "Ada",
    guestNameForConnection("peer-visitor"),
  ])
})

test("a guest's JOIN adopts the name it kept locally", async () => {
  const registry = emptyRegistry()
  const visitor = fakePeer("peer-visitor")
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, visitor, guest)
  await joinRoom(registry, ROOM, ada, member("Ada"))

  await receiveFromPeer(
    registry,
    ROOM,
    visitor,
    JSON.stringify({ type: "JOIN", payload: { name: "Wren" } }),
  )

  expect(rosterOf(visitor.published.at(-1)?.data)).toEqual(["Wren", "Ada"])
  expect(rosterOf(visitor.sent.at(-1))).toEqual(["Wren", "Ada"])
})

test("a member cannot rename itself over the wire — the session name stands", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  ada.published.length = 0

  await receiveFromPeer(
    registry,
    ROOM,
    ada,
    JSON.stringify({ type: "JOIN", payload: { name: "Administrator" } }),
  )

  expect(ada.published).toHaveLength(0)
  expect(rosterOf(ada.sent[0])).toEqual(["Ada"])
})

test("everyone in a room wears a different color", async () => {
  const registry = emptyRegistry()
  const peers = ["a", "b", "c"].map((id) => fakePeer(id))
  for (const peer of peers) await joinRoom(registry, ROOM, peer, guest)

  const roster = registry.rooms.get(ROOM)
  const colors = [...(roster?.participants.values() ?? [])].map(
    (p) => p.color.background,
  )
  expect(new Set(colors).size).toBe(3)
})

test("a cursor is relayed to the rest of the room, stamped with its sender", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  await receiveFromPeer(
    registry,
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

test("garbage from a peer is dropped, not relayed", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, guest)
  ada.published.length = 0

  await receiveFromPeer(registry, ROOM, ada, "}{")
  await receiveFromPeer(registry, ROOM, ada, '{"type":"SCENE_UPDATE"}')
  await receiveFromPeer(
    registry,
    ROOM,
    ada,
    sceneUpdate([{ id: "x" } as never]),
  )

  expect(ada.published).toHaveLength(0)
})

test("a message from a peer that never joined is ignored", async () => {
  const registry = emptyRegistry()
  const stranger = fakePeer("peer-stranger")

  await receiveFromPeer(
    registry,
    ROOM,
    stranger,
    JSON.stringify({ type: "JOIN", payload: { name: "Wren" } }),
  )

  expect(stranger.published).toHaveLength(0)
  expect(registry.rooms.has(ROOM)).toBe(false)
})

test("leaving drops the participant and tells the rest", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await joinRoom(registry, ROOM, grace, member("Grace"))

  leaveRoom(registry, ROOM, grace)

  expect(rosterOf(grace.published.at(-1)?.data)).toEqual(["Ada"])
  expect(registry.rooms.get(ROOM)?.participants.size).toBe(1)
})

test("the last peer out takes the room with it", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  leaveRoom(registry, ROOM, ada)

  expect(registry.rooms.has(ROOM)).toBe(false)
})

test("leaving twice is harmless", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  leaveRoom(registry, ROOM, ada)
  expect(() => leaveRoom(registry, ROOM, ada)).not.toThrow()
})

// --- follow mode (spec §1.3) --------------------------------------------

const follow = (target: string | null) =>
  JSON.stringify({
    type: "USER_FOLLOW",
    payload: { followedConnectionId: target },
  })

const viewport = (bounds: number[]) =>
  JSON.stringify({ type: "USER_VISIBLE_SCENE_BOUNDS", payload: { bounds } })

const followersIn = (message: ServerMessage | undefined) =>
  message?.type === "FOLLOWED_BY" ? message.payload.connectionIds : undefined

const viewportsIn = (peer: ReturnType<typeof fakePeer>) =>
  framesOf(peer, "USER_VISIBLE_SCENE_BOUNDS")

/** A room of `ada` and `grace`, with their join traffic already forgotten. */
async function twoPeerRoom() {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await joinRoom(registry, ROOM, grace, member("Grace"))
  for (const peer of [ada, grace]) {
    peer.sent.length = 0
    peer.published.length = 0
  }
  return { registry, ada, grace }
}

test("the followed peer is told it has an audience", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))

  expect(followersIn(ada.sent.at(-1))).toEqual(["peer-grace"])
  // Following is a private arrangement between two peers — nothing is
  // fanned out to the room.
  expect(grace.published).toHaveLength(0)
  expect(grace.sent).toHaveLength(0)
})

test("a viewport reaches the followers and nobody else", async () => {
  const { registry, ada, grace } = await twoPeerRoom()
  const wren = fakePeer("peer-wren")
  await joinRoom(registry, ROOM, wren, member("Wren"))
  wren.sent.length = 0

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  ada.sent.length = 0
  await receiveFromPeer(registry, ROOM, ada, viewport([0, 0, 100, 50]))

  expect(grace.sent.at(-1)).toEqual({
    type: "USER_VISIBLE_SCENE_BOUNDS",
    payload: { connectionId: "peer-ada", bounds: [0, 0, 100, 50] },
  })
  expect(viewportsIn(wren)).toHaveLength(0)
  expect(ada.published).toHaveLength(0)
})

test("two peers following each other don't drag each other around", async () => {
  const { registry, ada, grace } = await twoPeerRoom()
  const wren = fakePeer("peer-wren")
  await joinRoom(registry, ROOM, wren, member("Wren"))

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  await receiveFromPeer(registry, ROOM, ada, follow("peer-grace"))
  await receiveFromPeer(registry, ROOM, wren, follow("peer-ada"))
  for (const peer of [ada, grace, wren]) peer.sent.length = 0

  await receiveFromPeer(registry, ROOM, ada, viewport([0, 0, 100, 50]))

  // Only the mutual edge is dropped — Wren, who follows Ada one way, still
  // gets the viewport.
  expect(viewportsIn(grace)).toHaveLength(0)
  expect(wren.sent.at(-1)).toMatchObject({
    type: "USER_VISIBLE_SCENE_BOUNDS",
    payload: { connectionId: "peer-ada" },
  })
})

test("a ring of three doesn't chase itself around the room", async () => {
  const { registry, ada, grace } = await twoPeerRoom()
  const wren = fakePeer("peer-wren")
  await joinRoom(registry, ROOM, wren, member("Wren"))

  // ada → grace → wren → ada. Relaying any edge of this would hand each peer
  // bounds that move its canvas, which publishes bounds of its own, forever.
  await receiveFromPeer(registry, ROOM, ada, follow("peer-grace"))
  await receiveFromPeer(registry, ROOM, grace, follow("peer-wren"))
  await receiveFromPeer(registry, ROOM, wren, follow("peer-ada"))
  for (const peer of [ada, grace, wren]) peer.sent.length = 0

  for (const peer of [ada, grace, wren])
    await receiveFromPeer(registry, ROOM, peer, viewport([0, 0, 100, 50]))

  for (const peer of [ada, grace, wren])
    expect(viewportsIn(peer)).toHaveLength(0)
})

test("a chain of follows is not a ring, and keeps relaying", async () => {
  const { registry, ada, grace } = await twoPeerRoom()
  const wren = fakePeer("peer-wren")
  await joinRoom(registry, ROOM, wren, member("Wren"))

  // wren → ada → grace: nobody closes the loop, so both hops carry.
  await receiveFromPeer(registry, ROOM, ada, follow("peer-grace"))
  await receiveFromPeer(registry, ROOM, wren, follow("peer-ada"))
  for (const peer of [ada, grace, wren]) peer.sent.length = 0

  await receiveFromPeer(registry, ROOM, grace, viewport([0, 0, 100, 50]))
  await receiveFromPeer(registry, ROOM, ada, viewport([5, 5, 105, 55]))

  expect(ada.sent.at(-1)).toMatchObject({
    payload: { connectionId: "peer-grace" },
  })
  expect(wren.sent.at(-1)).toMatchObject({
    payload: { connectionId: "peer-ada" },
  })
})

test("a viewport nobody is following is relayed to nobody", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, ada, viewport([0, 0, 1, 1]))

  expect(viewportsIn(grace)).toHaveLength(0)
})

test("stopping tells the peer its audience is gone", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  await receiveFromPeer(registry, ROOM, grace, follow(null))

  expect(followersIn(ada.sent.at(-1))).toEqual([])

  ada.sent.length = 0
  await receiveFromPeer(registry, ROOM, ada, viewport([0, 0, 1, 1]))
  expect(viewportsIn(grace)).toHaveLength(0)
})

test("switching target updates both the old and the new audience", async () => {
  const { registry, ada, grace } = await twoPeerRoom()
  const wren = fakePeer("peer-wren")
  await joinRoom(registry, ROOM, wren, member("Wren"))
  wren.sent.length = 0

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  await receiveFromPeer(registry, ROOM, grace, follow("peer-wren"))

  expect(followersIn(ada.sent.at(-1))).toEqual([])
  expect(followersIn(wren.sent.at(-1))).toEqual(["peer-grace"])
})

test("following yourself, a stranger, or the same peer twice is a no-op", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, grace, follow("peer-grace"))
  await receiveFromPeer(registry, ROOM, grace, follow("peer-nobody"))
  expect(grace.sent).toHaveLength(0)
  expect(ada.sent).toHaveLength(0)

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  ada.sent.length = 0
  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  expect(ada.sent).toHaveLength(0)
})

test("a follower leaving takes its audience seat with it", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  leaveRoom(registry, ROOM, grace)

  expect(followersIn(ada.sent.at(-1))).toEqual([])
  // The departed follower must not still be relayed to.
  await receiveFromPeer(registry, ROOM, ada, viewport([0, 0, 1, 1]))
  expect(viewportsIn(grace)).toHaveLength(0)
})

test("when the followed peer leaves, the follow is forgotten", async () => {
  const { registry, ada, grace } = await twoPeerRoom()

  await receiveFromPeer(registry, ROOM, grace, follow("peer-ada"))
  leaveRoom(registry, ROOM, ada)

  expect(registry.rooms.get(ROOM)?.follows.size).toBe(0)
})

test("rooms are isolated — a peer only ever sees its own drawing's roster", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  await joinRoom(registry, "drawing-1", ada, member("Ada"))
  await joinRoom(registry, "drawing-2", grace, member("Grace"))

  expect(rosterOf(grace.sent[0])).toEqual(["Grace"])
  expect(registry.rooms.get("drawing-1")?.participants.size).toBe(1)
  expect(registry.rooms.get("drawing-2")?.participants.size).toBe(1)
})

// --- the authoritative scene -------------------------------------------

test("a joiner is handed the stored scene", async () => {
  const stored = [element("rect", 3)]
  const registry = createRoomRegistry(async () => ({
    elements: stored,
    ownerId: "owner-1",
  }))
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  expect(elementsOf(framesOf(ada, "SCENE_INIT")[0])).toEqual(stored)
  expect(registry.rooms.get(ROOM)?.sceneVersion).toBe(3)
  // Cached for the live badge, which the badge slice will read.
  expect(registry.rooms.get(ROOM)?.ownerId).toBe("owner-1")
})

test("the drawing is read once however many peers pile in at the same moment", async () => {
  let reads = 0
  const registry = createRoomRegistry(async () => {
    reads += 1
    return { elements: [element("rect", 1)], ownerId: null }
  })
  const peers = ["a", "b", "c"].map((id) => fakePeer(id))

  await Promise.all(peers.map((peer) => joinRoom(registry, ROOM, peer, guest)))

  expect(reads).toBe(1)
  for (const peer of peers) {
    expect(elementsOf(framesOf(peer, "SCENE_INIT")[0])).toHaveLength(1)
  }
})

test("a late joiner gets the scene as edited, not as stored", async () => {
  const registry = createRoomRegistry(async () => ({
    elements: [element("rect", 1)],
    ownerId: null,
  }))
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await receiveFromPeer(registry, ROOM, ada, sceneUpdate([element("rect", 4)]))

  const grace = fakePeer("peer-grace")
  await joinRoom(registry, ROOM, grace, member("Grace"))

  expect(elementsOf(framesOf(grace, "SCENE_INIT")[0])).toEqual([
    element("rect", 4),
  ])
})

test("an edit is relayed to the rest of the room and merged into the Room's copy", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  ada.published.length = 0

  await receiveFromPeer(registry, ROOM, ada, sceneUpdate([element("rect", 1)]))

  expect(ada.published).toEqual([
    {
      topic: ROOM_TOPIC,
      data: {
        type: "SCENE_UPDATE",
        payload: { elements: [element("rect", 1)] },
      },
    },
  ])
  expect(registry.rooms.get(ROOM)?.elements).toEqual([element("rect", 1)])
})

test("a stale edit is refused, and its sender is handed the version that won", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")
  await joinRoom(registry, ROOM, ada, member("Ada"))
  await joinRoom(registry, ROOM, grace, member("Grace"))
  await receiveFromPeer(
    registry,
    ROOM,
    ada,
    sceneUpdate([element("rect", 9, { text: "winner" })]),
  )
  grace.published.length = 0

  await receiveFromPeer(
    registry,
    ROOM,
    grace,
    sceneUpdate([element("rect", 2, { text: "loser" })]),
  )

  // The room hears the winner, not the stale claim...
  expect(elementsOf(grace.published.at(-1)?.data)).toEqual([
    element("rect", 9, { text: "winner" }),
  ])
  // ...and so does the peer that sent it, which is how it converges.
  expect(elementsOf(framesOf(grace, "SCENE_UPDATE").at(-1))).toEqual([
    element("rect", 9, { text: "winner" }),
  ])
  expect(registry.rooms.get(ROOM)?.elements).toEqual([
    element("rect", 9, { text: "winner" }),
  ])
})

test("an accepted edit needs no correction back to its sender", async () => {
  const registry = emptyRegistry()
  const ada = fakePeer("peer-ada")
  await joinRoom(registry, ROOM, ada, member("Ada"))

  await receiveFromPeer(registry, ROOM, ada, sceneUpdate([element("rect", 1)]))

  expect(framesOf(ada, "SCENE_UPDATE")).toHaveLength(0)
})

test("an edit that arrives before the scene has loaded still merges into it", async () => {
  let release = () => {}
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  const registry = createRoomRegistry(async () => {
    await opened
    return { elements: [element("stored", 1, { index: "a0" })], ownerId: null }
  })
  const ada = fakePeer("peer-ada")

  const joined = joinRoom(registry, ROOM, ada, member("Ada"))
  const edited = receiveFromPeer(
    registry,
    ROOM,
    ada,
    sceneUpdate([element("drawn", 1, { index: "a1" })]),
  )
  release()
  await Promise.all([joined, edited])

  expect(registry.rooms.get(ROOM)?.elements.map((e) => e.id)).toEqual([
    "stored",
    "drawn",
  ])
})

test("a Room whose drawing cannot be read still opens, on an empty scene", async () => {
  const registry = createRoomRegistry(async () => {
    throw new Error("database is down")
  })
  const ada = fakePeer("peer-ada")

  await joinRoom(registry, ROOM, ada, member("Ada"))

  // Cursors and presence keep working; an empty SCENE_INIT reconciles into a
  // client's own copy without adding or deleting anything.
  expect(elementsOf(framesOf(ada, "SCENE_INIT")[0])).toEqual([])
  expect(registry.rooms.get(ROOM)?.participants.size).toBe(1)
})

test("a peer that left mid-load is not sent a scene", async () => {
  let release = () => {}
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  const registry = createRoomRegistry(async () => {
    await opened
    return { elements: [], ownerId: null }
  })
  const ada = fakePeer("peer-ada")
  const grace = fakePeer("peer-grace")

  const joined = Promise.all([
    joinRoom(registry, ROOM, ada, member("Ada")),
    joinRoom(registry, ROOM, grace, member("Grace")),
  ])
  leaveRoom(registry, ROOM, ada)
  release()
  await joined

  expect(framesOf(ada, "SCENE_INIT")).toHaveLength(0)
  expect(framesOf(grace, "SCENE_INIT")).toHaveLength(1)
})

/** Seats the cap's worth of sockets, so the next join is the one refused. */
const fillRoom = (registry: RoomRegistry) =>
  Promise.all(
    Array.from({ length: MAX_ROOM_PARTICIPANTS }, (_, i) =>
      joinRoom(registry, ROOM, fakePeer(`peer-${i}`), guest),
    ),
  )

test("a room fills up to the cap", async () => {
  const registry = emptyRegistry()
  await fillRoom(registry)

  expect(registry.rooms.get(ROOM)?.participants.size).toBe(
    MAX_ROOM_PARTICIPANTS,
  )
})

test("the socket past the cap is refused and joins nothing", async () => {
  const registry = emptyRegistry()
  await fillRoom(registry)
  const late = fakePeer("peer-late")

  expect(await joinRoom(registry, ROOM, late, guest)).toEqual({
    status: "full",
  })
  expect(late.sent).toEqual([])
  expect(late.topics).toEqual([])
  expect(registry.rooms.get(ROOM)?.participants.size).toBe(
    MAX_ROOM_PARTICIPANTS,
  )
})

test("the room the refused socket knocked on is not told about it", async () => {
  const registry = emptyRegistry()
  await fillRoom(registry)
  const late = fakePeer("peer-late")

  await joinRoom(registry, ROOM, late, guest)

  expect(late.published).toEqual([])
})

test("a refused join does not start a scene read", async () => {
  let reads = 0
  const registry = createRoomRegistry(async () => {
    reads += 1
    return { elements: [], ownerId: null }
  })
  await fillRoom(registry)

  await joinRoom(registry, ROOM, fakePeer("peer-late"), guest)

  // One read for the Room itself, and none on the way back out.
  expect(reads).toBe(1)
})

test("a departure frees the slot", async () => {
  const registry = emptyRegistry()
  await fillRoom(registry)
  leaveRoom(registry, ROOM, fakePeer("peer-0"))

  expect(await joinRoom(registry, ROOM, fakePeer("peer-late"), guest)).toEqual({
    status: "ok",
  })
})

test("a full room does not keep anyone out of a different drawing", async () => {
  const registry = emptyRegistry()
  await fillRoom(registry)

  expect(
    await joinRoom(registry, "drawing-2", fakePeer("peer-late"), guest),
  ).toEqual({ status: "ok" })
})

test("a PING is answered, and never fans out to the room", async () => {
  const registry = emptyRegistry()
  const peer = fakePeer("peer-a")
  await joinRoom(registry, ROOM, peer, guest)
  peer.sent.length = 0
  peer.published.length = 0

  await receiveFromPeer(registry, ROOM, peer, '{"type":"PING","payload":{}}')

  expect(peer.sent).toEqual([{ type: "PONG", payload: {} }])
  expect(peer.published).toEqual([])
})

test("a PING is answered while the room is still reading its scene", async () => {
  // The heartbeat starts the moment the socket opens, and a slow scene read
  // must not make the very first beat look like a dead connection.
  const registry = createRoomRegistry(
    () => new Promise(() => {}) as Promise<never>,
  )
  const peer = fakePeer("peer-a")
  void joinRoom(registry, ROOM, peer, guest)

  await receiveFromPeer(registry, ROOM, peer, '{"type":"PING","payload":{}}')

  expect(peer.sent.at(-1)).toEqual({ type: "PONG", payload: {} })
})
