// Test helper: asserts a captured where clause contains a condition, such as
// the access rule. Placeholders are renumbered when the condition is nested.

import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect } from "vitest"

const render = (where: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(where)
  return { sql: sql.replace(/\$\d+/g, "$"), params }
}

export function expectCondition(where: SQL, condition: SQL) {
  const outer = render(where)
  const inner = render(condition)
  expect(outer.sql).toContain(inner.sql)
  expect(outer.params).toEqual(expect.arrayContaining(inner.params))
}
