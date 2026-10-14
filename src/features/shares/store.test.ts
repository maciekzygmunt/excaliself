import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test, vi } from "vitest"
import { drawingFiles, drawings, type Space, shares } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { expectCondition } from "@/features/spaces/expect-condition"
import {
  createShareLink,
  getShareLink,
  mintShareToken,
  regenerateShareLink,
  resolveShareByToken,
  resolveShareForRoom,
  resolveShareVisit,
  setShareLinkAudience,
  stopSharingDrawing,
} from "./store"

const HEX_256_BIT = /^[0-9a-f]{64}$/

type Op =
  | { kind: "select"; table: unknown; where: SQL; lock?: string }
  | { kind: "insert"; table: unknown; values: Record<string, unknown> }
  | {
      kind: "update"
      table: unknown
      set: Record<string, unknown>
      where: SQL
    }
  | { kind: "delete"; table: unknown; where: SQL }
type Call = Op & { inTransaction: boolean }

// Renders a captured drizzle condition so tests can assert what the SQL
// actually matches (the crux of the owner-only guarantee).
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where).sql

const SHARE_ROW = {
  token: "existing-token",
  audience: "members" as const,
  createdAt: new Date("2026-07-20"),
}

function fakeDb(options: {
  /** Rows the ownership select (from drawings) resolves to. */
  ownedDrawingIds?: string[]
  /** The space of those drawings. */
  space?: Space
  /** Rows any share select (from shares, joined) resolves to. */
  shareRows?: unknown[]
  /** Rows the drawing_files select resolves to. */
  fileRows?: unknown[]
  /** When false, updates match zero rows. */
  updateHits?: boolean
  /** When true, the insert hits the unique index and returns nothing. */
  insertConflicts?: boolean
}) {
  const calls: Call[] = []
  let inTransaction = false
  const record = (op: Op) => {
    const recorded: Call = { ...op, inTransaction }
    calls.push(recorded)
    return recorded
  }
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      inTransaction = true
      try {
        return await fn(db)
      } finally {
        inTransaction = false
      }
    },
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          innerJoin: () => chain,
          where: (where: SQL) => {
            const call = record({ kind: "select", table, where })
            const rows =
              table === drawings
                ? (options.ownedDrawingIds ?? []).map(() => ({
                    space: options.space ?? "private",
                  }))
                : table === drawingFiles
                  ? (options.fileRows ?? [])
                  : (options.shareRows ?? [])
            return Object.assign(Promise.resolve(rows), {
              for: (lock: string) => {
                Object.assign(call, { lock })
                return Promise.resolve(rows)
              },
            })
          },
        }
        return chain
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            record({ kind: "insert", table, values })
            if (options.insertConflicts) return Promise.resolve([])
            return Promise.resolve([
              {
                token: values.token,
                audience: values.audience,
                createdAt: values.createdAt,
              },
            ])
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: () => {
            record({ kind: "update", table, set, where })
            return Promise.resolve(
              options.updateHits === false ? [] : [{ ...SHARE_ROW, ...set }],
            )
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        record({ kind: "delete", table, where })
        return Promise.resolve()
      },
    }),
  }
  return { db: db as unknown as Parameters<typeof getShareLink>[0], calls }
}

test("mintShareToken is 256-bit hex and never repeats", () => {
  const a = mintShareToken()
  const b = mintShareToken()
  expect(a).toMatch(HEX_256_BIT)
  expect(b).toMatch(HEX_256_BIT)
  expect(a).not.toBe(b)
})

test("createShareLink checks access to a live drawing before inserting", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  const share = await createShareLink(db, "user-1", "d1", "anyone")

  expect(calls.map((call) => call.kind)).toEqual(["select", "insert"])
  const ownership = calls[0] as Extract<Call, { kind: "select" }>
  expect(ownership.table).toBe(drawings)
  expectCondition(ownership.where, accessibleTo(drawings, "user-1"))
  expect(toSql(ownership.where)).toContain(`"drawings"."deletedAt" is null`)

  const insert = calls[1] as Extract<Call, { kind: "insert" }>
  expect(insert.table).toBe(shares)
  expect(insert.values.token).toMatch(HEX_256_BIT)
  expect(insert.values.audience).toBe("anyone")
  expect(share.audience).toBe("anyone")
})

test("createShareLink throws not-found for a drawing the caller can't access, without touching shares", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: [] })

  await expect(createShareLink(db, "user-2", "d1", "members")).rejects.toThrow(
    "Drawing not found",
  )
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

// Regression: a stale dialog's create upserted the audience, so a link could
// tighten to members while its live guests stayed connected.
test("createShareLink on an already-shared drawing returns the live link unchanged", async () => {
  const { db, calls } = fakeDb({
    ownedDrawingIds: ["d1"],
    shareRows: [SHARE_ROW],
    insertConflicts: true,
  })

  const share = await createShareLink(db, "user-1", "d1", "anyone")

  expect(share).toEqual(SHARE_ROW)
  expect(calls.map((call) => call.kind)).toEqual(["select", "insert", "select"])
})

// A move to Team between the check and the write would leave a Team drawing
// with a members link, so the check locks the row inside the write's
// transaction.
test("createShareLink checks the space under a row lock in the insert's transaction", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  await createShareLink(db, "user-1", "d1", "members")

  const [check, insert] = calls
  expect(check).toMatchObject({ kind: "select", lock: "share" })
  expect(check.inTransaction && insert.inTransaction).toBe(true)
})

test("createShareLink refuses a members link on a Team drawing, without inserting", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"], space: "team" })

  await expect(createShareLink(db, "user-2", "d1", "members")).rejects.toThrow(
    "Team drawings take only guest links",
  )
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("createShareLink gives a Team drawing a guest link", async () => {
  const { db } = fakeDb({ ownedDrawingIds: ["d1"], space: "team" })

  const share = await createShareLink(db, "user-2", "d1", "anyone")

  expect(share.audience).toBe("anyone")
})

test("getShareLink scopes the read by the access rule", async () => {
  const { db, calls } = fakeDb({ shareRows: [SHARE_ROW] })

  const share = await getShareLink(db, "user-1", "d1")

  expect(share).toEqual(SHARE_ROW)
  const read = calls[0] as Extract<Call, { kind: "select" }>
  expectCondition(read.where, accessibleTo(drawings, "user-1"))
})

test("getShareLink returns null for an unshared drawing", async () => {
  const { db } = fakeDb({ shareRows: [] })
  await expect(getShareLink(db, "user-1", "d1")).resolves.toBeNull()
})

test("stopSharingDrawing deletes the share only after the ownership gate", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  await stopSharingDrawing(db, "user-1", "d1")

  expect(calls.map((call) => call.kind)).toEqual(["select", "delete"])
  const del = calls[1] as Extract<Call, { kind: "delete" }>
  expect(del.table).toBe(shares)
  expect(toSql(del.where)).toContain(`"shares"."drawingId" =`)
})

test("stopSharingDrawing refuses a non-owner before any delete", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: [] })

  await expect(stopSharingDrawing(db, "user-2", "d1")).rejects.toThrow(
    "Drawing not found",
  )
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("regenerateShareLink mints a fresh token and keeps the audience", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  const share = await regenerateShareLink(db, "user-1", "d1")

  const update = calls[1] as Extract<Call, { kind: "update" }>
  expect(update.table).toBe(shares)
  expect(Object.keys(update.set)).toEqual(["token"])
  expect(update.set.token).toMatch(HEX_256_BIT)
  expect(update.set.token).not.toBe(SHARE_ROW.token)
  expect(share.audience).toBe(SHARE_ROW.audience)
})

test("regenerateShareLink on an unshared drawing throws", async () => {
  const { db } = fakeDb({ ownedDrawingIds: ["d1"], updateHits: false })
  await expect(regenerateShareLink(db, "user-1", "d1")).rejects.toThrow(
    "Share not found",
  )
})

test("setShareLinkAudience updates only the audience", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  const share = await setShareLinkAudience(db, "user-1", "d1", "anyone")

  const update = calls[1] as Extract<Call, { kind: "update" }>
  expect(update.set).toEqual({ audience: "anyone" })
  expect(share.audience).toBe("anyone")
  expect(share.token).toBe(SHARE_ROW.token)
})

test("setShareLinkAudience refuses members on a Team drawing, without updating", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"], space: "team" })

  await expect(
    setShareLinkAudience(db, "user-2", "d1", "members"),
  ).rejects.toThrow("Team drawings take only guest links")
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("setShareLinkAudience checks the space under a row lock in the update's transaction", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  await setShareLinkAudience(db, "user-1", "d1", "members")

  const [check, update] = calls
  expect(check).toMatchObject({ kind: "select", lock: "share" })
  expect(check.inTransaction && update.inTransaction).toBe(true)
})

test("setShareLinkAudience on an unshared drawing throws", async () => {
  const { db } = fakeDb({ ownedDrawingIds: ["d1"], updateHits: false })
  await expect(
    setShareLinkAudience(db, "user-1", "d1", "anyone"),
  ).rejects.toThrow("Share not found")
})

test("resolveShareByToken looks up by token and returns null for unknown tokens", async () => {
  const { db, calls } = fakeDb({ shareRows: [] })

  await expect(resolveShareByToken(db, "no-such-token")).resolves.toBeNull()
  const read = calls[0] as Extract<Call, { kind: "select" }>
  expect(read.table).toBe(shares)
  expect(toSql(read.where)).toContain(`"shares"."token" =`)
})

// --- resolveShareVisit: what the /share/$token loader actually serves ----

const RESOLVED = {
  audience: "members" as const,
  drawing: {
    id: "d1",
    name: "Wireframe",
    data: "{}",
    deletedAt: null as Date | null,
  },
}

test("visit with an unknown token serves the bare dead arm and nothing else", async () => {
  const { db } = fakeDb({ shareRows: [] })

  await expect(
    resolveShareVisit(db, "no-such-token", async () => true),
  ).resolves.toEqual({ status: "dead" })
})

test("visit to a trashed drawing serves the identical dead arm, session or not", async () => {
  const trashed = {
    ...RESOLVED,
    drawing: { ...RESOLVED.drawing, deletedAt: new Date("2026-07-01") },
  }
  const { db } = fakeDb({ shareRows: [trashed] })

  await expect(
    resolveShareVisit(db, "live-token", async () => true),
  ).resolves.toEqual({ status: "dead" })
})

test("members link without a session serves the sign-in arm with the name only", async () => {
  const { db } = fakeDb({ shareRows: [RESOLVED] })

  await expect(
    resolveShareVisit(db, "live-token", async () => false),
  ).resolves.toEqual({ status: "signin", drawingName: "Wireframe" })
})

test("members link with a session opens with the drawing and its files", async () => {
  const row = {
    fileId: "f1",
    mimeType: "image/png",
    bytes: Buffer.from("ABCD"),
  }
  const { db } = fakeDb({ shareRows: [RESOLVED], fileRows: [row] })

  await expect(
    resolveShareVisit(db, "live-token", async () => true),
  ).resolves.toEqual({
    status: "ok",
    audience: "members",
    drawing: { id: "d1", name: "Wireframe", data: "{}" },
    files: [
      {
        fileId: "f1",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,QUJDRA==",
      },
    ],
  })
})

test("anyone link opens without ever consulting the session", async () => {
  const hasSession = vi.fn()
  const { db } = fakeDb({
    shareRows: [{ ...RESOLVED, audience: "anyone" }],
  })

  const result = await resolveShareVisit(db, "live-token", hasSession)

  expect(result.status).toBe("ok")
  expect(hasSession).not.toHaveBeenCalled()
})

test("resolveShareForRoom reads by token and leaves the scene JSON on the server", async () => {
  const row = {
    audience: "anyone" as const,
    drawing: { id: "d1", deletedAt: null },
  }
  const { db, calls } = fakeDb({ shareRows: [row] })

  await expect(resolveShareForRoom(db, "live-token")).resolves.toEqual(row)
  const read = calls[0] as Extract<Call, { kind: "select" }>
  expect(read.table).toBe(shares)
  expect(toSql(read.where)).toContain(`"shares"."token" =`)
})

test("resolveShareForRoom returns null for an unknown token", async () => {
  const { db } = fakeDb({ shareRows: [] })
  await expect(resolveShareForRoom(db, "no-such-token")).resolves.toBeNull()
})
