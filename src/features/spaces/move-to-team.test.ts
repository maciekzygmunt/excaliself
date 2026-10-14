import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, folders, shares } from "@/db/schema"
import { inPrivateSpaceOf } from "./access"
import { expectCondition } from "./expect-condition"
import { moveToTeam } from "./move-to-team"

type Row = Record<string, unknown>
type Write =
  | { kind: "update"; table: unknown; set: Row; where: SQL }
  | { kind: "delete"; table: unknown; where: SQL }

const toSql = (where: SQL) => new PgDialect().sqlToQuery(where)

/**
 * Each select on a table returns the next of `selects[table]`: what the
 * database would match. Writes are recorded.
 */
function fakeDb(selects: { folders?: Row[][]; drawings?: Row[][] }) {
  const queues = new Map<unknown, Row[][]>([
    [folders, [...(selects.folders ?? [])]],
    [drawings, [...(selects.drawings ?? [])]],
  ])
  const reads: { table: unknown; where: SQL }[] = []
  const writes: Write[] = []
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          reads.push({ table, where })
          return Promise.resolve(queues.get(table)?.shift() ?? [])
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (set: Row) => ({
        where: (where: SQL) => {
          writes.push({ kind: "update", table, set, where })
          return Promise.resolve()
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        writes.push({ kind: "delete", table, where })
        return Promise.resolve()
      },
    }),
  }
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof moveToTeam>[0]
  return { db, reads, writes }
}

/** Ids a write's where clause names. */
const idsIn = (write: Write | undefined) =>
  write ? toSql(write.where).params : []

const live = null
const trashed = new Date()

// f1 ─┬─ f2 (trashed) ── f3
//     └─ d1, d2 (trashed), d3 in f3
const privateFolders = [
  { id: "f1", parentId: null, deletedAt: live },
  { id: "f2", parentId: "f1", deletedAt: trashed },
  { id: "f3", parentId: "f2", deletedAt: trashed },
  { id: "other", parentId: null, deletedAt: live },
]

test("a folder moves to Team with its whole subtree, trashed rows included", async () => {
  const { db, reads, writes } = fakeDb({
    folders: [privateFolders],
    drawings: [[{ id: "d1" }, { id: "d2" }, { id: "d3" }]],
  })

  const moved = await moveToTeam(
    db,
    "user-1",
    { type: "folder", id: "f1" },
    null,
  )

  expect(moved).toEqual(["d1", "d2", "d3"])
  const spaceWrites = writes.flatMap((write) =>
    write.kind === "update" && write.set.space === "team" ? [write] : [],
  )
  const folderWrite = spaceWrites.find((write) => write.table === folders)
  expect(idsIn(folderWrite).sort()).toEqual(["f1", "f2", "f3"])
  const drawingWrite = spaceWrites.find((write) => write.table === drawings)
  expect(idsIn(drawingWrite)).toEqual(["d1", "d2", "d3"])
  // Creators are kept.
  for (const write of spaceWrites)
    expect(write.set).not.toHaveProperty("createdBy")

  // The subtree reads see the trash too, and only the caller's Private rows.
  for (const { table, where } of reads) {
    expect(toSql(where).sql).not.toContain("deletedAt")
    expectCondition(
      where,
      inPrivateSpaceOf(table as typeof folders | typeof drawings, "user-1"),
    )
  }
})

test("the moved folder lands under the Team target", async () => {
  const { db, writes } = fakeDb({
    folders: [[{ id: "team-folder" }], privateFolders],
    drawings: [[]],
  })

  await moveToTeam(db, "user-1", { type: "folder", id: "f1" }, "team-folder")

  expect(writes).toContainEqual(
    expect.objectContaining({
      table: folders,
      set: { parentId: "team-folder" },
    }),
  )
  const landing = writes.find(
    (write) => write.kind === "update" && "parentId" in write.set,
  )
  expect(idsIn(landing)).toEqual(["f1"])
})

test("a drawing moves to Team root and returns its own id", async () => {
  const { db, reads, writes } = fakeDb({ drawings: [[{ id: "d1" }]] })

  const moved = await moveToTeam(
    db,
    "user-1",
    { type: "drawing", id: "d1" },
    null,
  )

  expect(moved).toEqual(["d1"])
  expect(writes).toContainEqual(
    expect.objectContaining({
      table: drawings,
      set: { space: "team", folderId: null },
    }),
  )
  expectCondition(reads[0].where, inPrivateSpaceOf(drawings, "user-1"))
})

test("members links on the moved drawings are deleted; anyone links are kept", async () => {
  const { db, writes } = fakeDb({
    folders: [privateFolders],
    drawings: [[{ id: "d1" }, { id: "d2" }]],
  })

  await moveToTeam(db, "user-1", { type: "folder", id: "f1" }, null)

  const deletes = writes.filter((write) => write.kind === "delete")
  expect(deletes).toHaveLength(1)
  expect(deletes[0].table).toBe(shares)
  const { sql, params } = toSql(deletes[0].where)
  expect(sql).toContain(`"shares"."audience" = `)
  expect(params).toEqual(expect.arrayContaining(["d1", "d2", "members"]))
  expect(params).not.toContain("anyone")
})

test("a Team item or someone else's item is refused, and nothing is written", async () => {
  // The Private-space condition matches neither, so the reads come back empty.
  for (const item of [
    { type: "drawing", id: "team-or-theirs" },
    { type: "folder", id: "team-or-theirs" },
  ] as const) {
    const { db, writes } = fakeDb({ folders: [privateFolders] })

    await expect(moveToTeam(db, "user-1", item, null)).rejects.toThrow(
      "not found",
    )
    expect(writes).toEqual([])
  }
})

test("a trashed folder is refused", async () => {
  const { db, writes } = fakeDb({ folders: [privateFolders] })

  await expect(
    moveToTeam(db, "user-1", { type: "folder", id: "f2" }, null),
  ).rejects.toThrow("Folder not found")
  expect(writes).toEqual([])
})

test("a target that is not a live Team folder is refused", async () => {
  const { db, reads, writes } = fakeDb({ folders: [[]] })

  await expect(
    moveToTeam(db, "user-1", { type: "drawing", id: "d1" }, "private-folder"),
  ).rejects.toThrow("Folder not found")
  expect(writes).toEqual([])
  const { sql, params } = toSql(reads[0].where)
  expect(sql).toContain(`"folders"."space" = `)
  expect(params).toContain("team")
})
