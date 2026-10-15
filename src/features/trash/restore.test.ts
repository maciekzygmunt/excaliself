import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, folders, type Space } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { expectCondition } from "@/features/spaces/expect-condition"
import { restoreDrawingUnit, restoreFolderUnit } from "./restore"

type FolderRow = {
  id: string
  parentId: string | null
  deletedAt: Date | null
  space: Space
}

const TRASHED = new Date("2026-10-01T00:00:00Z")
const folder = (
  id: string,
  space: Space,
  parentId: string | null = null,
  deletedAt: Date | null = null,
): FolderRow => ({ id, parentId, deletedAt, space })

// The first update is the restore itself and returns `restored`; the folder
// select returns `visibleFolders`, every folder the caller can see. Locks are
// recorded with the number of updates before them.
function fakeDb(options: {
  restored: unknown[]
  visibleFolders?: FolderRow[]
}) {
  const updates: {
    table: unknown
    set: Record<string, unknown>
    where: SQL
  }[] = []
  const locks: { sql: string; updatesBefore: number }[] = []
  const tx = {
    execute: (query: SQL) => {
      const { sql } = new PgDialect().sqlToQuery(query)
      locks.push({ sql, updatesBefore: updates.length })
      return Promise.resolve()
    },
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          updates.push({ table, set, where })
          const rows = updates.length === 1 ? options.restored : []
          return Object.assign(Promise.resolve(), {
            returning: () => Promise.resolve(rows),
          })
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(options.visibleFolders ?? []),
      }),
    }),
  }
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof restoreDrawingUnit>[0]
  return { db, updates, locks }
}

const UNTRASHED = { deletedAt: null, trashRootId: null, deletedBy: null }

test("any member restores a Team drawing: the restore uses the access rule and clears who trashed it", async () => {
  const { db, updates } = fakeDb({
    restored: [{ id: "d1", folderId: null, space: "team" }],
  })

  await restoreDrawingUnit(db, "member-b", "d1")

  expect(updates[0].table).toBe(drawings)
  expect(updates[0].set).toEqual(UNTRASHED)
  expectCondition(updates[0].where, accessibleTo(drawings, "member-b"))
})

test("a Team drawing whose folder is trashed lands under the nearest live Team folder", async () => {
  const { db, updates } = fakeDb({
    restored: [{ id: "d1", folderId: "t-child", space: "team" }],
    visibleFolders: [
      folder("t-parent", "team"),
      folder("t-child", "team", "t-parent", TRASHED),
    ],
  })

  const result = await restoreDrawingUnit(db, "member-b", "d1")

  expect(result).toEqual({ originalFolderGone: false })
  expect(updates[1].set).toEqual({ folderId: "t-parent" })
})

test("a Team drawing never lands under a Private folder, even when a folder chain crosses spaces", async () => {
  const { db, updates } = fakeDb({
    restored: [{ id: "d1", folderId: "t-child", space: "team" }],
    visibleFolders: [
      folder("p-live", "private"),
      folder("t-child", "team", "p-live", TRASHED),
    ],
  })

  await restoreDrawingUnit(db, "member-b", "d1")

  // Team root, not the live Private folder above it
  expect(updates[1].set).toEqual({ folderId: null })
})

test("a Team folder unit restores whole, clears who trashed it, and falls back to Team root when its parent is gone", async () => {
  const { db, updates } = fakeDb({
    restored: [
      { id: "f1", parentId: "gone", space: "team" },
      { id: "f1-child", parentId: "f1", space: "team" },
    ],
    visibleFolders: [folder("p-live", "private")],
  })

  const result = await restoreFolderUnit(db, "member-b", "f1")

  expect(result).toEqual({ originalParentGone: true })
  const [unitFolders, unitDrawings, landing] = updates
  expect(unitFolders.set).toEqual(UNTRASHED)
  expectCondition(unitFolders.where, accessibleTo(folders, "member-b"))
  expect(unitDrawings.table).toBe(drawings)
  expect(unitDrawings.set).toEqual(UNTRASHED)
  expect(landing.set).toEqual({ parentId: null })
})

test("the folder tree is locked before the restore: alone for a folder, shared for a drawing", async () => {
  const folderRestore = fakeDb({
    restored: [{ id: "f1", parentId: null, space: "team" }],
  })
  await restoreFolderUnit(folderRestore.db, "member-b", "f1")
  expect(folderRestore.locks).toEqual([
    {
      sql: expect.stringContaining("select pg_advisory_xact_lock("),
      updatesBefore: 0,
    },
  ])

  const drawingRestore = fakeDb({
    restored: [{ id: "d1", folderId: null, space: "team" }],
  })
  await restoreDrawingUnit(drawingRestore.db, "member-b", "d1")
  expect(drawingRestore.locks).toEqual([
    {
      sql: expect.stringContaining("select pg_advisory_xact_lock_shared("),
      updatesBefore: 0,
    },
  ])
})
