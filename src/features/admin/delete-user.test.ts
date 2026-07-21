import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { users, verifications } from "@/db/schema"
import { deleteUserAccount } from "./delete-user"

type Call =
  | { kind: "select"; where: SQL; lock?: string }
  | { kind: "delete"; table: unknown; where: SQL }

// Renders a captured drizzle condition so tests can assert what the SQL
// actually matches — mirrors destroy.test.ts.
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where)

function fakeDb(options: {
  target?: { role: "admin" | "user"; email: string }
  adminIds?: string[]
  /** The target row disappears between the role select and the delete. */
  vanishesBeforeDelete?: boolean
}) {
  const calls: Call[] = []
  // The engine issues two selects in order: the target row, then (for admin
  // targets) the locked admin roster. Answer them positionally.
  const selectResponses: unknown[][] = [
    options.target ? [options.target] : [],
    (options.adminIds ?? []).map((id) => ({ id })),
  ]
  let selectIndex = 0
  const tx = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          const call: Call = { kind: "select", where }
          calls.push(call)
          const rows = selectResponses[selectIndex++] ?? []
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
              table === users && options.target && !options.vanishesBeforeDelete
                ? [{ email: options.target.email }]
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

const shape = (call: Call) =>
  call.kind === "select"
    ? { kind: call.kind }
    : { kind: call.kind, table: call.table }

test("deletes a regular user and sweeps their verification rows", async () => {
  const { db, calls } = fakeDb({
    target: { role: "user", email: "bea@example.com" },
  })

  await deleteUserAccount(db, "admin-1", "user-bea")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
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

test("deleting an admin is allowed while another admin remains, behind a row lock", async () => {
  const { db, calls } = fakeDb({
    target: { role: "admin", email: "ada@example.com" },
    adminIds: ["user-ada", "admin-1"],
  })

  await deleteUserAccount(db, "admin-1", "user-ada")

  expect(calls.map(shape)).toEqual([
    { kind: "select" },
    { kind: "select" },
    { kind: "delete", table: users },
    { kind: "delete", table: verifications },
  ])
  // The roster read must lock the admin rows — a plain count would let two
  // admins deleting each other concurrently both pass the guard.
  expect(calls[1]).toMatchObject({ kind: "select", lock: "update" })
})

test("deleting the last remaining admin is rejected", async () => {
  const { db, calls } = fakeDb({
    target: { role: "admin", email: "ada@example.com" },
    adminIds: ["user-ada"],
  })

  await expect(deleteUserAccount(db, "admin-1", "user-ada")).rejects.toThrow(
    "last admin",
  )
  expect(calls.some((call) => call.kind === "delete")).toBe(false)
})

test("a target that vanishes between the role select and the delete throws not-found", async () => {
  const { db } = fakeDb({
    target: { role: "user", email: "bea@example.com" },
    vanishesBeforeDelete: true,
  })

  await expect(deleteUserAccount(db, "admin-1", "user-bea")).rejects.toThrow(
    "User not found",
  )
})

test("self-delete through the admin path is rejected before touching the db", async () => {
  const { db, calls } = fakeDb({
    target: { role: "admin", email: "ada@example.com" },
    adminIds: ["admin-1", "user-ada", "user-cy"],
  })

  await expect(deleteUserAccount(db, "admin-1", "admin-1")).rejects.toThrow()
  expect(calls).toEqual([])
})

test("an unknown user id throws not-found", async () => {
  const { db } = fakeDb({})

  await expect(deleteUserAccount(db, "admin-1", "nope")).rejects.toThrow(
    "User not found",
  )
})
