import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test, vi } from "vitest"
import { drawingFiles, drawings, shares } from "@/db/schema"
import {
  createShareLink,
  getShareLink,
  mintShareToken,
  regenerateShareLink,
  resolveShareByToken,
  resolveShareVisit,
  setShareLinkAudience,
  stopSharingDrawing,
} from "./store"

const HEX_256_BIT = /^[0-9a-f]{64}$/

type Call =
  | { kind: "select"; table: unknown; where: SQL }
  | {
      kind: "insert"
      table: unknown
      values: Record<string, unknown>
      onConflictSet: Record<string, unknown>
    }
  | {
      kind: "update"
      table: unknown
      set: Record<string, unknown>
      where: SQL
    }
  | { kind: "delete"; table: unknown; where: SQL }

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
  /** Rows any share select (from shares, joined) resolves to. */
  shareRows?: unknown[]
  /** Rows the drawing_files select resolves to. */
  fileRows?: unknown[]
  /** When false, updates match zero rows. */
  updateHits?: boolean
}) {
  const calls: Call[] = []
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          innerJoin: () => chain,
          where: (where: SQL) => {
            calls.push({ kind: "select", table, where })
            if (table === drawings)
              return Promise.resolve(
                (options.ownedDrawingIds ?? []).map((id) => ({ id })),
              )
            if (table === drawingFiles)
              return Promise.resolve(options.fileRows ?? [])
            return Promise.resolve(options.shareRows ?? [])
          },
        }
        return chain
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
          returning: () => {
            calls.push({ kind: "insert", table, values, onConflictSet: set })
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
            calls.push({ kind: "update", table, set, where })
            return Promise.resolve(
              options.updateHits === false ? [] : [{ ...SHARE_ROW, ...set }],
            )
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        calls.push({ kind: "delete", table, where })
        return Promise.resolve()
      },
    }),
  } as unknown as Parameters<typeof getShareLink>[0]
  return { db, calls }
}

test("mintShareToken is 256-bit hex and never repeats", () => {
  const a = mintShareToken()
  const b = mintShareToken()
  expect(a).toMatch(HEX_256_BIT)
  expect(b).toMatch(HEX_256_BIT)
  expect(a).not.toBe(b)
})

test("createShareLink verifies ownership of a live drawing before inserting", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  const share = await createShareLink(db, "user-1", "d1", "anyone")

  expect(calls.map((call) => call.kind)).toEqual(["select", "insert"])
  const ownership = calls[0] as Extract<Call, { kind: "select" }>
  expect(ownership.table).toBe(drawings)
  const sql = toSql(ownership.where)
  expect(sql).toContain(`"drawings"."ownerId" =`)
  expect(sql).toContain(`"drawings"."deletedAt" is null`)

  const insert = calls[1] as Extract<Call, { kind: "insert" }>
  expect(insert.table).toBe(shares)
  expect(insert.values.token).toMatch(HEX_256_BIT)
  expect(insert.values.audience).toBe("anyone")
  expect(share.audience).toBe("anyone")
})

test("createShareLink throws not-found for a drawing the caller doesn't own, without touching shares", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: [] })

  await expect(createShareLink(db, "user-2", "d1", "members")).rejects.toThrow(
    "Drawing not found",
  )
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("createShareLink on an already-shared drawing keeps the live token but adopts the picked audience", async () => {
  const { db, calls } = fakeDb({ ownedDrawingIds: ["d1"] })

  await createShareLink(db, "user-1", "d1", "anyone")

  // The conflict clause is the one-link-per-drawing arbiter: it must touch
  // only the audience, never replace the circulating token.
  const insert = calls[1] as Extract<Call, { kind: "insert" }>
  expect(insert.onConflictSet).toEqual({ audience: "anyone" })
})

test("getShareLink scopes the read to the drawing's owner", async () => {
  const { db, calls } = fakeDb({ shareRows: [SHARE_ROW] })

  const share = await getShareLink(db, "user-1", "d1")

  expect(share).toEqual(SHARE_ROW)
  const read = calls[0] as Extract<Call, { kind: "select" }>
  expect(toSql(read.where)).toContain(`"drawings"."ownerId" =`)
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
  const file = { fileId: "f1", mimeType: "image/png", dataUrl: "data:," }
  const { db } = fakeDb({ shareRows: [RESOLVED], fileRows: [file] })

  await expect(
    resolveShareVisit(db, "live-token", async () => true),
  ).resolves.toEqual({
    status: "ok",
    audience: "members",
    drawing: { id: "d1", name: "Wireframe", data: "{}" },
    files: [file],
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
