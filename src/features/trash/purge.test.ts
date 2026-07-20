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
  | { kind: "update"; table: unknown; set: Record<string, unknown> }
  | { kind: "delete"; table: unknown }

function fakeDb(options: {
  folderRows: ReturnType<typeof folderRow>[]
  deletedDrawingIds?: string[]
  deletedFolderIds?: string[]
}) {
  const calls: Call[] = []
  const tx = {
    select: () => ({ from: () => Promise.resolve(options.folderRows) }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: () => {
          calls.push({ kind: "update", table, set })
          return Promise.resolve()
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => ({
        returning: () => {
          calls.push({ kind: "delete", table })
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

test("a full pass re-parents survivors, then deletes expired drawings and folders, reporting counts", async () => {
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
  expect(calls).toEqual([
    { kind: "update", table: folders, set: { parentId: null } },
    { kind: "update", table: drawings, set: { folderId: null } },
    { kind: "delete", table: drawings },
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
  expect(calls).toEqual([{ kind: "delete", table: drawings }])
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
