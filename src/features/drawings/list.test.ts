import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { expectCondition } from "@/features/spaces/expect-condition"
import { listDrawings } from "./list"

// Records the list's where clause; the query resolves to no rows.
function fakeDb() {
  const seen: { table?: unknown; where?: SQL } = {}
  const chain = {
    leftJoin: () => chain,
    where: (where: SQL) => {
      seen.where = where
      return chain
    },
    orderBy: () => Promise.resolve([]),
  }
  const db = {
    select: () => ({
      from: (table: unknown) => {
        seen.table = table
        return chain
      },
    }),
  } as unknown as Parameters<typeof listDrawings>[0]
  return { db, seen }
}

test("search runs over the access rule's drawings, with trash left out", async () => {
  const { db, seen } = fakeDb()

  await listDrawings(db, "user-1")

  expect(seen.table).toBe(drawings)
  if (!seen.where) throw new Error("no where clause")
  expectCondition(seen.where, accessibleTo(drawings, "user-1"))
  expect(new PgDialect().sqlToQuery(seen.where).sql).toContain(
    `"drawings"."deletedAt" is null`,
  )
})
