import type { SQL } from "drizzle-orm"
import { expect, test } from "vitest"
import { drawings, shares } from "@/db/schema"
import { LINK_DEAD_CLOSE_CODE } from "@/features/collab/protocol"
import type { RoomPeer } from "@/features/collab/room-session"
import {
  createRoomRegistry,
  joinRoom,
  receiveFromPeer,
} from "@/features/collab/room-session"
import { regenerateShare, setShareAudience, stopSharing } from "./lifecycle"

const OWNER = "user-1"
const DRAWING = "d1"

type Call = { kind: "select" | "update" | "delete"; table: unknown }

/**
 * The slice of drizzle these three call through `store.ts`: an ownership
 * select, then one write. Deliberately thinner than `store.test.ts`'s — what
 * the SQL matches is that file's subject, and what is asserted here is the
 * order of the two worlds, which is why every call is also stamped into the
 * shared `log` the peers close into.
 */
function fakeDb(log: string[] = []) {
  const calls: Call[] = []
  const record = (kind: Call["kind"], table: unknown) => {
    calls.push({ kind, table })
    log.push(kind)
  }
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          innerJoin: () => chain,
          where: () => {
            record("select", table)
            return Promise.resolve([{ id: DRAWING }])
          },
        }
        return chain
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (_where: SQL) => ({
          returning: () => {
            record("update", table)
            return Promise.resolve([
              { token: "new-token", audience: "members", ...set },
            ])
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        record("delete", table)
        return Promise.resolve()
      },
    }),
  } as unknown as Parameters<typeof stopSharing>[0]
  return { db, calls }
}

/** Records the closes and, with them, what the database had already done. */
function fakePeer(id: string, log: string[]) {
  const closes: { code: number; reason: string }[] = []
  const peer: RoomPeer & { closes: typeof closes } = {
    id,
    closes,
    send: () => {},
    publish: () => {},
    subscribe: () => {},
    close: (code, reason) => {
      closes.push({ code, reason })
      log.push(`close:${id}`)
    },
  }
  return peer
}

const registryWith = (log: string[]) =>
  createRoomRegistry(
    async () => ({ elements: [], ownerId: OWNER, readable: true }),
    async () => {
      log.push("write")
    },
  )

const member = { userId: "u:ada", displayName: "Ada" }
const guest = { userId: null, displayName: null }

test("stopping deletes the row, writes the scene, then closes the sockets", async () => {
  const log: string[] = []
  const { db, calls } = fakeDb(log)
  const registry = registryWith(log)
  const ada = fakePeer("peer-ada", log)
  const grace = fakePeer("peer-grace", log)
  await joinRoom(registry, DRAWING, ada, member)
  await joinRoom(registry, DRAWING, grace, guest)
  await receiveFromPeer(
    registry,
    DRAWING,
    grace,
    JSON.stringify({
      type: "SCENE_UPDATE",
      payload: { elements: [{ id: "g", version: 1, versionNonce: 1 }] },
    }),
  )

  await stopSharing(db, registry, OWNER, DRAWING)

  // The row is gone before anyone is closed, which is what makes the closed
  // sockets unreplaceable: a redial re-validates and is refused. The guest's
  // last stroke is in the database before its socket ever hears about it.
  expect(log).toEqual([
    "select",
    "delete",
    "write",
    "close:peer-ada",
    "close:peer-grace",
  ])
  expect(calls[1].table).toBe(shares)
  expect(ada.closes).toEqual([
    { code: LINK_DEAD_CLOSE_CODE, reason: "Link no longer active" },
  ])
  expect(grace.closes).toHaveLength(1)
  expect(registry.rooms.has(DRAWING)).toBe(false)
})

test("stopping a drawing nobody is in still deletes the row", async () => {
  const { db, calls } = fakeDb()

  await stopSharing(db, registryWith([]), OWNER, DRAWING)

  expect(calls.map((call) => call.kind)).toEqual(["select", "delete"])
})

test("stopping refuses a drawing the caller doesn't own, and closes nobody", async () => {
  const log: string[] = []
  const registry = registryWith(log)
  const ada = fakePeer("peer-ada", log)
  await joinRoom(registry, DRAWING, ada, member)
  const db = {
    select: () => ({
      from: () => {
        const chain = {
          innerJoin: () => chain,
          where: () => Promise.resolve([]),
        }
        return chain
      },
    }),
  } as unknown as Parameters<typeof stopSharing>[0]

  await expect(
    stopSharing(db, registry, "someone-else", DRAWING),
  ).rejects.toThrow("Drawing not found")
  expect(ada.closes).toEqual([])
  expect(registry.rooms.has(DRAWING)).toBe(true)
})

test("regenerating hands back the new link and evicts everyone", async () => {
  const log: string[] = []
  const { db, calls } = fakeDb()
  const registry = registryWith(log)
  const ada = fakePeer("peer-ada", log)
  const grace = fakePeer("peer-grace", log)
  await joinRoom(registry, DRAWING, ada, member)
  await joinRoom(registry, DRAWING, grace, guest)

  const share = await regenerateShare(db, registry, OWNER, DRAWING)

  // The token is replaced first; the sockets it admitted go after.
  expect(calls.map((call) => call.kind)).toEqual(["select", "update"])
  expect(calls[1].table).toBe(shares)
  expect(share.token).toMatch(/^[0-9a-f]{64}$/)
  expect(ada.closes).toHaveLength(1)
  expect(grace.closes).toHaveLength(1)
})

test("tightening the audience evicts the guests the row no longer admits", async () => {
  const log: string[] = []
  const { db } = fakeDb()
  const registry = registryWith(log)
  const ada = fakePeer("peer-ada", log)
  const grace = fakePeer("peer-grace", log)
  await joinRoom(registry, DRAWING, ada, member)
  await joinRoom(registry, DRAWING, grace, guest)

  const share = await setShareAudience(db, registry, OWNER, DRAWING, "members")

  expect(share.audience).toBe("members")
  expect(grace.closes).toHaveLength(1)
  expect(ada.closes).toEqual([])
})

test("loosening to anyone evicts nobody", async () => {
  const log: string[] = []
  const { db } = fakeDb()
  const registry = registryWith(log)
  const ada = fakePeer("peer-ada", log)
  const grace = fakePeer("peer-grace", log)
  await joinRoom(registry, DRAWING, ada, member)
  await joinRoom(registry, DRAWING, grace, guest)

  await setShareAudience(db, registry, OWNER, DRAWING, "anyone")

  expect(ada.closes).toEqual([])
  expect(grace.closes).toEqual([])
  expect(registry.rooms.get(DRAWING)?.seats.size).toBe(2)
})

test("the ownership gate reads drawings, not shares", async () => {
  const log: string[] = []
  const { db, calls } = fakeDb()

  await setShareAudience(db, registryWith(log), OWNER, DRAWING, "members")

  expect(calls[0]).toEqual({ kind: "select", table: drawings })
})
