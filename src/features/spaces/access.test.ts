import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawings, folders } from "@/db/schema"
import { accessibleTo, canAccess, inPrivateSpaceOf } from "./access"

const toSql = (where: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(where)
  return { sql, params }
}

test("a row is accessible to its creator or, in Team, to every member", () => {
  for (const table of [drawings, folders]) {
    const name = table === drawings ? "drawings" : "folders"
    expect(toSql(accessibleTo(table, "user-ada"))).toEqual({
      sql: `("${name}"."createdBy" = $1 or "${name}"."space" = $2)`,
      params: ["user-ada", "team"],
    })
  }
})

test("a member's Private rows are the ones they created in Private", () => {
  expect(toSql(inPrivateSpaceOf(drawings, "user-ada"))).toEqual({
    sql: `("drawings"."createdBy" = $1 and "drawings"."space" = $2)`,
    params: ["user-ada", "private"],
  })
})

test("in memory, a Private row is only its creator's and a Team row is everyone's", () => {
  const privateRow = { space: "private" as const, createdBy: "user-ada" }
  const teamRow = { space: "team" as const, createdBy: "user-ada" }
  const orphanedTeamRow = { space: "team" as const, createdBy: null }

  expect(canAccess(privateRow, "user-ada")).toBe(true)
  expect(canAccess(privateRow, "user-bea")).toBe(false)
  expect(canAccess(teamRow, "user-bea")).toBe(true)
  expect(canAccess(orphanedTeamRow, "user-bea")).toBe(true)
})
