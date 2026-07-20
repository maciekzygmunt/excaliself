import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { afterEach, expect, test, vi } from "vitest"
import { drawings, folders } from "@/db/schema"
import {
  purgeExpiredTrash,
  splitExpiredFolders,
  startTrashPurgeJob,
} from "./purge"
import {
  daysUntilPurge,
  purgeCutoff,
  purgeDeadline,
  TRASH_RETENTION_DAYS,
} from "./retention"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date("2026-07-20T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// --- retention helpers ---------------------------------------------------

test("purgeDeadline is deletedAt plus the retention window", () => {
  expect(purgeDeadline(daysAgo(0))).toEqual(
    new Date(NOW.getTime() + TRASH_RETENTION_DAYS * DAY_MS),
  )
})

test("purgeCutoff mirrors purgeDeadline: deadline lapsed iff deletedAt <= cutoff", () => {
  const cutoff = purgeCutoff(NOW)
  expect(purgeDeadline(cutoff)).toEqual(NOW)
  expect(
    purgeDeadline(daysAgo(TRASH_RETENTION_DAYS + 1)).getTime(),
  ).toBeLessThan(NOW.getTime())
})

test("daysUntilPurge rounds up and clamps overdue items at zero", () => {
  expect(daysUntilPurge(daysAgo(0), NOW)).toBe(30)
  expect(daysUntilPurge(new Date(NOW.getTime() - 0.5 * DAY_MS), NOW)).toBe(30)
  expect(daysUntilPurge(daysAgo(29), NOW)).toBe(1)
  expect(daysUntilPurge(daysAgo(30), NOW)).toBe(0)
  expect(daysUntilPurge(daysAgo(45), NOW)).toBe(0)
})

// --- splitExpiredFolders --------------------------------------------------

const folderRow = (
  id: string,
  parentId: string | null = null,
  deletedAt: Date | null = null,
) => ({ id, parentId, deletedAt })

test("an expired folder and its expired subtree are all deleted, nothing re-parented", () => {
  const rows = [
    folderRow("root", null, daysAgo(31)),
    folderRow("child", "root", daysAgo(31)),
    folderRow("grandchild", "child", daysAgo(40)),
  ]
  const { expiredIds, reparentIds } = splitExpiredFolders(
    rows,
    purgeCutoff(NOW),
  )
  expect(new Set(expiredIds)).toEqual(new Set(["root", "child", "grandchild"]))
  expect(reparentIds).toEqual([])
})

test("live and unexpired-trashed children of an expired folder are re-parented, not deleted", () => {
  const rows = [
    folderRow("expired", null, daysAgo(31)),
    folderRow("live-child", "expired", null),
    folderRow("fresh-trash-child", "expired", daysAgo(5)),
    folderRow("live-grandchild", "live-child", null),
  ]
  const { expiredIds, reparentIds } = splitExpiredFolders(
    rows,
    purgeCutoff(NOW),
  )
  expect(expiredIds).toEqual(["expired"])
  // Only the direct children need the FK edge severed; the grandchild
  // survives with them.
  expect(new Set(reparentIds)).toEqual(
    new Set(["live-child", "fresh-trash-child"]),
  )
})

test("trash still inside its window is left alone entirely", () => {
  const rows = [
    folderRow("fresh", null, daysAgo(29)),
    folderRow("fresh-child", "fresh", daysAgo(29)),
    folderRow("live", null, null),
  ]
  const { expiredIds, reparentIds } = splitExpiredFolders(
    rows,
    purgeCutoff(NOW),
  )
  expect(expiredIds).toEqual([])
  expect(reparentIds).toEqual([])
})

test("items trashed exactly at the cutoff are purged", () => {
  const rows = [folderRow("boundary", null, daysAgo(30))]
  expect(splitExpiredFolders(rows, purgeCutoff(NOW)).expiredIds).toEqual([
    "boundary",
  ])
})

// --- purgeExpiredTrash orchestration ---------------------------------------

type Call =
  | { kind: "select"; lock: unknown }
  | {
      kind: "update"
      table: unknown
      set: Record<string, unknown>
      where: SQL
    }
  | { kind: "delete"; table: unknown; where: SQL }

// Renders a captured drizzle condition so tests can assert what the SQL
// actually re-checks at write time (the crux of the concurrent-restore fix).
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where)

function fakeDb(options: {
  folderRows: ReturnType<typeof folderRow>[]
  deletedDrawingIds?: string[]
  deletedFolderIds?: string[]
}) {
  const calls: Call[] = []
  const tx = {
    select: () => ({
      from: () => ({
        for: (lock: unknown) => {
          calls.push({ kind: "select", lock })
          return Promise.resolve(options.folderRows)
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          calls.push({ kind: "update", table, set, where })
          return Promise.resolve()
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => ({
        returning: () => {
          calls.push({ kind: "delete", table, where })
          const ids =
            table === drawings
              ? (options.deletedDrawingIds ?? [])
              : (options.deletedFolderIds ?? [])
          return Promise.resolve(ids.map((id) => ({ id })))
        },
      }),
    }),
  }
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof purgeExpiredTrash>[0]
  return { db, calls }
}

const shape = (call: Call) =>
  call.kind === "select"
    ? { kind: call.kind, lock: call.lock }
    : call.kind === "update"
      ? { kind: call.kind, table: call.table, set: call.set }
      : { kind: call.kind, table: call.table }

test("a full pass locks folders, re-parents surviving folders, deletes expired drawings, then evacuates and deletes expired folders", async () => {
  const { db, calls } = fakeDb({
    folderRows: [
      folderRow("expired", null, daysAgo(31)),
      folderRow("live-child", "expired", null),
    ],
    deletedDrawingIds: ["d1", "d2"],
    deletedFolderIds: ["expired"],
  })

  const counts = await purgeExpiredTrash(db, NOW)

  expect(counts).toEqual({ purgedDrawings: 2, purgedFolders: 1 })
  expect(calls.map(shape)).toEqual([
    { kind: "select", lock: "update" },
    { kind: "update", table: folders, set: { parentId: null } },
    { kind: "delete", table: drawings },
    // Survivors are pulled out of expired folders AFTER the drawings delete,
    // so even a drawing restored mid-pass escapes the folder cascade.
    { kind: "update", table: drawings, set: { folderId: null } },
    { kind: "delete", table: folders },
  ])
})

test("with no expired folders, only the expired-drawings delete runs", async () => {
  const { db, calls } = fakeDb({
    folderRows: [folderRow("live", null, null)],
    deletedDrawingIds: ["d1"],
  })

  const counts = await purgeExpiredTrash(db, NOW)

  expect(counts).toEqual({ purgedDrawings: 1, purgedFolders: 0 })
  expect(calls.map(shape)).toEqual([
    { kind: "select", lock: "update" },
    { kind: "delete", table: drawings },
  ])
})

// --- concurrent restore between select and delete ---------------------------
// Under READ COMMITTED a restore can commit after the folder snapshot is
// read; the writes must never trust the pre-selected ID sets alone.

test("the folder delete re-asserts the expiry predicate, and counts come from the rows actually deleted", async () => {
  const { db, calls } = fakeDb({
    folderRows: [
      folderRow("purged", null, daysAgo(31)),
      folderRow("restored-mid-pass", null, daysAgo(31)),
    ],
    // Simulates "restored-mid-pass" being restored between the select and
    // the delete: the re-asserted deletedAt <= cutoff predicate skips it.
    deletedFolderIds: ["purged"],
  })

  const counts = await purgeExpiredTrash(db, NOW)

  // The count reflects what was deleted, not the pre-selected expired set.
  expect(counts).toEqual({ purgedDrawings: 0, purgedFolders: 1 })

  const folderDelete = calls.find(
    (call) => call.kind === "delete" && call.table === folders,
  )
  expect(folderDelete).toBeDefined()
  const { sql, params } = toSql((folderDelete as { where: SQL }).where)
  // Deletes by ID *and* by still-lapsed deletedAt — an ID match alone must
  // never delete a row whose restore committed after the select.
  expect(sql).toContain(`"folders"."id" in `)
  expect(sql).toContain(`"folders"."deletedAt" <= `)
  expect(params).toContainEqual(purgeCutoff(NOW).toISOString())
})

test("the drawings delete matches on deletedAt, never on pre-selected IDs", async () => {
  const { db, calls } = fakeDb({
    folderRows: [folderRow("expired", null, daysAgo(31))],
    deletedFolderIds: ["expired"],
  })

  await purgeExpiredTrash(db, NOW)

  const drawingsDelete = calls.find(
    (call) => call.kind === "delete" && call.table === drawings,
  )
  const { sql, params } = toSql((drawingsDelete as { where: SQL }).where)
  expect(sql).toContain(`"drawings"."deletedAt" <= `)
  expect(params).toEqual([purgeCutoff(NOW).toISOString()])
})

test("the post-delete evacuation moves EVERY drawing left in an expired folder, including one restored mid-pass", async () => {
  const { db, calls } = fakeDb({
    folderRows: [folderRow("expired", null, daysAgo(31))],
    deletedFolderIds: ["expired"],
  })

  await purgeExpiredTrash(db, NOW)

  const evacuation = calls.find(
    (call) => call.kind === "update" && call.table === drawings,
  )
  expect(evacuation).toBeDefined()
  const { sql } = toSql((evacuation as { where: SQL }).where)
  // No deletedAt filter: a drawing whose restore committed after the
  // drawings delete skipped it must still be re-parented out of the folder
  // before the cascade fires.
  expect(sql).toContain(`"drawings"."folderId" in `)
  expect(sql).not.toContain("deletedAt")
  // And it runs between the drawings delete and the folder delete.
  const kinds = calls.map((call) =>
    call.kind === "select"
      ? "select"
      : `${call.kind}:${call.table === drawings ? "drawings" : "folders"}`,
  )
  expect(kinds.indexOf("update:drawings")).toBeGreaterThan(
    kinds.indexOf("delete:drawings"),
  )
  expect(kinds.indexOf("update:drawings")).toBeLessThan(
    kinds.indexOf("delete:folders"),
  )
})

// --- startTrashPurgeJob -----------------------------------------------------

test("runs a pass at boot and again every interval, logging counts", async () => {
  vi.useFakeTimers()
  const log = vi.spyOn(console, "log").mockImplementation(() => {})
  const runPass = vi
    .fn<() => Promise<{ purgedDrawings: number; purgedFolders: number }>>()
    .mockResolvedValue({ purgedDrawings: 3, purgedFolders: 1 })

  const stop = startTrashPurgeJob(runPass, 1000)
  await vi.advanceTimersByTimeAsync(0)
  expect(runPass).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith(
    "[trash-purge] pass complete: purged 3 drawing(s), 1 folder(s)",
  )

  await vi.advanceTimersByTimeAsync(2000)
  expect(runPass).toHaveBeenCalledTimes(3)

  stop()
  await vi.advanceTimersByTimeAsync(5000)
  expect(runPass).toHaveBeenCalledTimes(3)
})

test("a failed pass is logged and does not break the schedule", async () => {
  vi.useFakeTimers()
  vi.spyOn(console, "log").mockImplementation(() => {})
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  const runPass = vi
    .fn<() => Promise<{ purgedDrawings: number; purgedFolders: number }>>()
    .mockRejectedValueOnce(new Error("db down"))
    .mockResolvedValue({ purgedDrawings: 0, purgedFolders: 0 })

  const stop = startTrashPurgeJob(runPass, 1000)
  await vi.advanceTimersByTimeAsync(0)
  expect(error).toHaveBeenCalledWith(
    "[trash-purge] pass failed",
    new Error("db down"),
  )

  await vi.advanceTimersByTimeAsync(1000)
  expect(runPass).toHaveBeenCalledTimes(2)
  stop()
})
