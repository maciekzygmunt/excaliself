import { expect, test } from "vitest"
import { liveDrawingsFor, MAX_LIVE_AVATARS } from "./live"
import type { ServerMessage } from "./protocol"
import {
  createRoomRegistry,
  joinRoom,
  leaveRoom,
  type RoomPeer,
  type SceneLoader,
} from "./room-session"

const OWNER = "user-owner"

const fakePeer = (id: string): RoomPeer => ({
  id,
  send: (_data: ServerMessage) => {},
  publish: (_topic: string, _data: ServerMessage) => {},
  subscribe: (_topic: string) => {},
  close: (_code: number, _reason: string) => {},
})

/** Every drawing in these tests belongs to OWNER unless a test says otherwise. */
const ownedByOwner: SceneLoader = async () => ({
  elements: [],
  access: { space: "private", createdBy: OWNER },
  readable: true,
})

/** Presence, not persistence — these rooms never write. */
const registryOf = (load: SceneLoader = ownedByOwner) =>
  createRoomRegistry(load, async () => {})

const member = (userId: string, displayName: string) => ({
  userId,
  displayName,
})
const guest = (displayName: string) => ({
  userId: null,
  displayName,
})

test("a room with someone else in it becomes one badge", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([
    {
      drawingId: "d1",
      count: 1,
      participants: [{ name: "Quiet Otter", color: expect.anything() }],
    },
  ])
})

test("avatar colors are the participant colors drawn on the canvas", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))

  const [badge] = liveDrawingsFor(registry, OWNER)
  const participant = registry.rooms.get("d1")?.seats.get("p1")?.participant
  expect(badge.participants[0].color).toEqual(participant?.color)
})

test("the payload carries no userIds", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), member("u:ada", "Ada"))

  const [badge] = liveDrawingsFor(registry, OWNER)
  expect(Object.keys(badge.participants[0]).sort()).toEqual(["color", "name"])
})

test("drawings someone else owns are not the caller's business", async () => {
  const registry = registryOf(async () => ({
    elements: [],
    access: { space: "private", createdBy: "someone-else" },
    readable: true,
  }))
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([])
})

test("a Team room shows for every member, minus their own tabs", async () => {
  const registry = registryOf(async () => ({
    elements: [],
    access: { space: "team", createdBy: "someone-else" },
    readable: true,
  }))
  await joinRoom(registry, "d1", fakePeer("p1"), member(OWNER, "Owner"))
  await joinRoom(registry, "d1", fakePeer("p2"), member("u:ada", "Ada"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([
    { drawingId: "d1", count: 1, participants: [expect.anything()] },
  ])
  expect(liveDrawingsFor(registry, "u:ada")[0].count).toBe(1)
})

test("a room alone with its owner shows no badge", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), member(OWNER, "Owner"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([])
})

test("the owner's other tabs don't count either, but everyone else does", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), member(OWNER, "Owner"))
  await joinRoom(registry, "d1", fakePeer("p2"), member(OWNER, "Owner"))
  await joinRoom(registry, "d1", fakePeer("p3"), guest("Quiet Otter"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([
    {
      drawingId: "d1",
      count: 1,
      participants: [{ name: "Quiet Otter", color: expect.anything() }],
    },
  ])
})

test("guests always count — they have no userId to match the caller's", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))
  await joinRoom(registry, "d1", fakePeer("p2"), guest("Brisk Auk"))

  expect(liveDrawingsFor(registry, OWNER)[0].count).toBe(2)
})

test("the stack caps at four avatars while the count stays true", async () => {
  const registry = registryOf()
  const joined = MAX_LIVE_AVATARS + 3
  for (let i = 0; i < joined; i++)
    await joinRoom(registry, "d1", fakePeer(`p${i}`), guest(`Guest ${i}`))

  const [badge] = liveDrawingsFor(registry, OWNER)
  expect(badge.count).toBe(joined)
  expect(badge.participants).toHaveLength(MAX_LIVE_AVATARS)
  expect(badge.participants.map((p) => p.name)).toEqual([
    "Guest 0",
    "Guest 1",
    "Guest 2",
    "Guest 3",
  ])
})

test("every live room the caller owns gets its own entry", async () => {
  const registry = registryOf()
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))
  await joinRoom(registry, "d2", fakePeer("p2"), guest("Brisk Auk"))

  expect(liveDrawingsFor(registry, OWNER).map((b) => b.drawingId)).toEqual([
    "d1",
    "d2",
  ])
})

test("the last visitor leaving takes the badge with them", async () => {
  const registry = registryOf()
  const owner = fakePeer("p1")
  const visitor = fakePeer("p2")
  await joinRoom(registry, "d1", owner, member(OWNER, "Owner"))
  await joinRoom(registry, "d1", visitor, guest("Quiet Otter"))

  leaveRoom(registry, "d1", visitor)

  expect(liveDrawingsFor(registry, OWNER)).toEqual([])
})

test("a room whose drawing never loaded belongs to nobody", async () => {
  const registry = registryOf(async () => {
    throw new Error("no such drawing")
  })
  await joinRoom(registry, "d1", fakePeer("p1"), guest("Quiet Otter"))

  expect(liveDrawingsFor(registry, OWNER)).toEqual([])
})
