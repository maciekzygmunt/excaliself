import type { SQL } from "drizzle-orm"
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, folders, users, verifications } from "@/db/schema"
import { inPrivateSpaceOf } from "@/features/spaces/access"
import { expectCondition } from "@/features/spaces/expect-condition"
import {
  countOwnedContent,
  deleteUserAccount,
  hardDeleteUser,
} from "./delete-user"

type Call =
  | { kind: "select"; where: SQL; lock?: string }
  | { kind: "delete"; table: unknown; where: SQL }

// Renders a captured drizzle condition so tests can assert what the SQL
// actually matches — mirrors destroy.test.ts.
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where)

function fakeDb(options: {
  /** What the locking read returns: the target row plus every admin. */
  rows?: Array<{ id: string; role: "admin" | "user" }>
  /** Email the users-delete returns for the verifications sweep. */
  email?: string
  /** The target row disappears between the locking read and the delete. */
  vanishesBeforeDelete?: boolean
}) {
  const calls: Call[] = []
  const rows = options.rows ?? []
  const tx = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          const call: Call = { kind: "select", where }
          calls.push(call)
          const lockable = (result: Promise<unknown[]>) =>
            Object.assign(result, {
              for: (lock: string) => {
                call.lock = lock
                return Promise.resolve(rows)
              },
            })
          return Object.assign(lockable(Promise.resolve(rows)), {
            orderBy: () => lockable(Promise.resolve(rows)),
          })
        },
      }),
    }),
    delete: (table: unknown) => ({
      // Record on where() so both `await …where()` and `…where().returning()`
      // register exactly one call.
      where: (where: SQL) => {
        calls.push({ kind: "delete", table, where })
        return Object.assign(Promise.resolve(), {
          returning: () =>
            Promise.resolve(
              table === users && options.email && !options.vanishesBeforeDelete
                ? [{ email: options.email }]
                : [],
            ),
        })
      },
    }),
  }
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof deleteUserAccount>[0]
  return { db, calls }
}

// Answers each count query from a fixed set of rows by rendering its where
// clause, so the test checks which rows each count actually matches.
function countingDb(
  rows: Array<{
    table: typeof drawings | typeof folders
    createdBy: string
    space: "private" | "team"
  }>,
) {
  const matches = (where: SQL, row: (typeof rows)[number]) => {
    const { sql, params } = toSql(where)
    const creatorOk = params.includes(row.createdBy)
    const spaceOk = params.includes(row.space)
    // Both must hold: an "or" (the access rule) is the wrong condition.
    return creatorOk && spaceOk && !sql.includes(" or ")
  }
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async (where: SQL) => [
          {
            count: rows.filter(
              (row) => row.table === table && matches(where, row),
            ).length,
          },
        ],
      }),
    }),
  } as unknown as Parameters<typeof countOwnedContent>[0]
}

const shape = (call: Call) =>
  call.kind === "select"
    ? { kind: call.kind }
    : { kind: call.kind, table: call.table }

test("deletes a regular user and sweeps their verification rows", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-bea", role: "user" },
    ],
    email: "bea@example.com",
  })

  await deleteUserAccount(db, "admin-1", "user-bea")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "delete", table: drawings },
    { kind: "delete", table: folders },
    { kind: "delete", table: users },
    { kind: "delete", table: verifications },
  ])

  const userDelete = calls.find(
    (call) => call.kind === "delete" && call.table === users,
  )
  expect(toSql((userDelete as { where: SQL }).where).params).toEqual([
    "user-bea",
  ])
  // verifications has no FK to users — it's keyed by email.
  const verificationsDelete = calls.find(
    (call) => call.kind === "delete" && call.table === verifications,
  )
  expect(toSql((verificationsDelete as { where: SQL }).where).params).toEqual([
    "bea@example.com",
  ])
})

test("deletes the member's Private drawings and folders; their Team rows lose only the creator", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-bea", role: "user" },
    ],
    email: "bea@example.com",
  })

  await deleteUserAccount(db, "admin-1", "user-bea")

  for (const table of [drawings, folders]) {
    const del = calls.find(
      (call) => call.kind === "delete" && call.table === table,
    )
    expectCondition(
      (del as { where: SQL }).where,
      inPrivateSpaceOf(table, "user-bea"),
    )
    // Team rows are left to the FK, which keeps them with createdBy = null.
    const creator = getTableConfig(table).foreignKeys.find(
      (fk) => fk.reference().columns[0].name === "createdBy",
    )
    expect(creator?.onDelete).toBe("set null")
  }
})

test("the role read locks the target row even for non-admin targets", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-bea", role: "user" },
    ],
    email: "bea@example.com",
  })

  await deleteUserAccount(db, "admin-1", "user-bea")

  // An unlocked role read can go stale: concurrent role changes could make
  // the target the sole admin before the delete lands, locking the instance
  // out. The read must lock target + admin roster in one ordered set.
  expect(calls[0]).toMatchObject({ kind: "select", lock: "update" })
  expect(toSql((calls[0] as { where: SQL }).where).params).toEqual([
    "admin",
    "user-bea",
  ])
})

test("deleting an admin is allowed while another admin remains, behind a row lock", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-ada", role: "admin" },
    ],
    email: "ada@example.com",
  })

  await deleteUserAccount(db, "admin-1", "user-ada")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "delete", table: drawings },
    { kind: "delete", table: folders },
    { kind: "delete", table: users },
    { kind: "delete", table: verifications },
  ])
  // The read must lock the admin rows — a plain count would let two admins
  // deleting each other concurrently both pass the guard.
  expect(calls[0]).toMatchObject({ kind: "select", lock: "update" })
})

test("deleting the last remaining admin is rejected", async () => {
  const { db, calls } = fakeDb({
    rows: [{ id: "user-ada", role: "admin" }],
    email: "ada@example.com",
  })

  await expect(deleteUserAccount(db, "admin-1", "user-ada")).rejects.toThrow(
    "last admin",
  )
  expect(calls.some((call) => call.kind === "delete")).toBe(false)
})

test("a target that vanishes between the locking read and the delete throws not-found", async () => {
  const { db } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-bea", role: "user" },
    ],
    email: "bea@example.com",
    vanishesBeforeDelete: true,
  })

  await expect(deleteUserAccount(db, "admin-1", "user-bea")).rejects.toThrow(
    "User not found",
  )
})

test("self-delete through the admin path is rejected before touching the db", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "admin-1", role: "admin" },
      { id: "user-ada", role: "admin" },
      { id: "user-cy", role: "admin" },
    ],
  })

  await expect(deleteUserAccount(db, "admin-1", "admin-1")).rejects.toThrow()
  expect(calls).toEqual([])
})

// hardDeleteUser is the actorless core the Account danger zone calls
// directly (issue #67): no self-delete rejection, same last-admin guard.

test("hardDeleteUser lets an admin delete themselves while another admin remains", async () => {
  const { db, calls } = fakeDb({
    rows: [
      { id: "user-ada", role: "admin" },
      { id: "user-bea", role: "admin" },
    ],
    email: "ada@example.com",
  })

  await hardDeleteUser(db, "user-ada")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "delete", table: drawings },
    { kind: "delete", table: folders },
    { kind: "delete", table: users },
    { kind: "delete", table: verifications },
  ])
})

test("hardDeleteUser rejects the sole admin deleting themselves", async () => {
  const { db, calls } = fakeDb({
    rows: [{ id: "user-ada", role: "admin" }],
    email: "ada@example.com",
  })

  await expect(hardDeleteUser(db, "user-ada")).rejects.toThrow("last admin")
  expect(calls.some((call) => call.kind === "delete")).toBe(false)
})

test("an unknown user id throws not-found", async () => {
  const { db } = fakeDb({
    rows: [{ id: "admin-1", role: "admin" }],
  })

  await expect(deleteUserAccount(db, "admin-1", "nope")).rejects.toThrow(
    "User not found",
  )
})

test("counts split the member's Private rows from the Team drawings they created", async () => {
  const db = countingDb([
    { table: drawings, createdBy: "user-bea", space: "private" },
    { table: drawings, createdBy: "user-bea", space: "private" },
    { table: folders, createdBy: "user-bea", space: "private" },
    { table: drawings, createdBy: "user-bea", space: "team" },
    { table: drawings, createdBy: "user-bea", space: "team" },
    { table: drawings, createdBy: "user-bea", space: "team" },
    // Team folders are not counted; Team drawings carry the sentence.
    { table: folders, createdBy: "user-bea", space: "team" },
    // Another member's rows count for nobody but them.
    { table: drawings, createdBy: "user-cy", space: "private" },
    { table: drawings, createdBy: "user-cy", space: "team" },
  ])

  expect(await countOwnedContent(db, "user-bea")).toEqual({
    drawings: 2,
    folders: 1,
    teamDrawings: 3,
  })
})
