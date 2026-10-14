import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, type Space, users } from "@/db/schema"
import { isTeamEnabled } from "./team-enabled"

type Row = { space: Space; trashed: boolean }

// Applies the two conditions the flag can use (space, trashed) to in-memory
// rows, so the tests assert what the query matches rather than its shape.
const matches = (where: SQL, row: Row) => {
  const { sql, params } = new PgDialect().sqlToQuery(where)
  if (sql.includes('"space" =') && !params.includes(row.space)) return false
  if (sql.includes('"deletedAt" is null') && row.trashed) return false
  return true
}

function fakeDb(state: { members: number; drawings?: Row[]; folders?: Row[] }) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === users) return Promise.resolve([{ count: state.members }])
        const rows = (table === drawings ? state.drawings : state.folders) ?? []
        return {
          where: (where: SQL) => ({
            limit: () => Promise.resolve(rows.filter((r) => matches(where, r))),
          }),
        }
      },
    }),
  } as unknown as Parameters<typeof isTeamEnabled>[0]
}

test("a solo instance with nothing in Team hides Team", async () => {
  const db = fakeDb({
    members: 1,
    drawings: [{ space: "private", trashed: false }],
    folders: [{ space: "private", trashed: true }],
  })
  expect(await isTeamEnabled(db)).toBe(false)
})

test("a second member shows Team", async () => {
  expect(await isTeamEnabled(fakeDb({ members: 2 }))).toBe(true)
})

test("a solo instance keeps Team while it holds a trashed row", async () => {
  const trashedTeamRow: Row = { space: "team", trashed: true }
  expect(
    await isTeamEnabled(fakeDb({ members: 1, drawings: [trashedTeamRow] })),
  ).toBe(true)
  expect(
    await isTeamEnabled(fakeDb({ members: 1, folders: [trashedTeamRow] })),
  ).toBe(true)
})
