import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, folders } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { expectCondition } from "@/features/spaces/expect-condition"
import { destroyTrashUnit } from "./destroy"

type Call =
  | { kind: "select"; where: SQL }
  | {
      kind: "update"
      table: unknown
      set: Record<string, unknown>
      where: SQL
    }
  | { kind: "delete"; table: unknown; where: SQL }

// Renders a captured drizzle condition so tests can assert what the SQL
// actually matches (the crux of the cascade-evacuation fix).
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where)

function fakeDb(options: {
  unitFolderIds?: string[]
  deletedDrawingIds?: string[]
  deletedFolderIds?: string[]
}) {
  const calls: Call[] = []
  const tx = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          calls.push({ kind: "select", where })
          return Promise.resolve(
            (options.unitFolderIds ?? []).map((id) => ({ id })),
          )
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
  } as unknown as Parameters<typeof destroyTrashUnit>[0]
  return { db, calls }
}

const shape = (call: Call) =>
  call.kind === "select"
    ? { kind: call.kind }
    : call.kind === "update"
      ? { kind: call.kind, table: call.table, set: call.set }
      : { kind: call.kind, table: call.table }

test("a drawing unit deletes without any evacuation", async () => {
  const { db, calls } = fakeDb({ deletedDrawingIds: ["d1"] })

  await destroyTrashUnit(db, "user-1", "d1")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "delete", table: drawings },
    { kind: "delete", table: folders },
  ])
})

test("a folder unit evacuates other units' rows out of its subtree between the drawings delete and the folder cascade", async () => {
  const { db, calls } = fakeDb({
    unitFolderIds: ["f1", "f1-child"],
    deletedFolderIds: ["f1", "f1-child"],
  })

  await destroyTrashUnit(db, "user-1", "f1")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "delete", table: drawings },
    { kind: "update", table: folders, set: { parentId: null } },
    { kind: "update", table: drawings, set: { folderId: null } },
    { kind: "delete", table: folders },
  ])
})

test("the folder evacuation detaches children of unit folders but never the unit's own folders", async () => {
  const { db, calls } = fakeDb({
    unitFolderIds: ["f1"],
    deletedFolderIds: ["f1"],
  })

  await destroyTrashUnit(db, "user-1", "f1")

  const evacuation = calls.find(
    (call) => call.kind === "update" && call.table === folders,
  )
  expect(evacuation).toBeDefined()
  const { sql } = toSql((evacuation as { where: SQL }).where)
  expect(sql).toContain(`"folders"."parentId" in `)
  expect(sql).toContain(`not "folders"."id" in `)
})

test("the drawings evacuation moves EVERY drawing left in a unit folder — no access, deletedAt, or trashRootId filter", async () => {
  const { db, calls } = fakeDb({
    unitFolderIds: ["f1"],
    deletedFolderIds: ["f1"],
  })

  await destroyTrashUnit(db, "user-1", "f1")

  const evacuation = calls.find(
    (call) => call.kind === "update" && call.table === drawings,
  )
  expect(evacuation).toBeDefined()
  const { sql } = toSql((evacuation as { where: SQL }).where)
  // A separately trashed drawing (its own trashRootId) or one restored
  // mid-flight must be re-parented out before the folder cascade fires.
  expect(sql).toContain(`"drawings"."folderId" in `)
  expect(sql).not.toContain("deletedAt")
  expect(sql).not.toContain("trashRootId")
  expect(sql).not.toContain("createdBy")
})

test("the unit deletes stay access-scoped and re-assert deletedAt", async () => {
  const { db, calls } = fakeDb({
    unitFolderIds: ["f1"],
    deletedFolderIds: ["f1"],
  })

  await destroyTrashUnit(db, "user-1", "f1")

  for (const table of [drawings, folders]) {
    const del = calls.find(
      (call) => call.kind === "delete" && call.table === table,
    )
    const { where } = del as { where: SQL }
    expectCondition(where, accessibleTo(table, "user-1"))
    const { sql, params } = toSql(where)
    expect(sql).toContain(`"trashRootId" = `)
    expect(sql).toContain(`"deletedAt" is not null`)
    expect(params).toContain("f1")
  }
})

test("an id matching no unit rows throws not-found", async () => {
  const { db } = fakeDb({})

  await expect(destroyTrashUnit(db, "user-1", "nope")).rejects.toThrow(
    "Trash item not found",
  )
})
