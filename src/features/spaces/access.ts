// The access rule: a member can see and act on a drawing or folder iff they
// created it or it lives in Team. Every server module that reads or writes
// drawings or folders goes through here; none checks createdBy itself.

import { eq, type SQL, sql } from "drizzle-orm"
import type { drawings, folders, Space } from "@/db/schema"

type SpacedTable = typeof drawings | typeof folders

/** Where condition: rows of `table` that `userId` can see and act on. */
export function accessibleTo(table: SpacedTable, userId: string): SQL {
  return sql`(${eq(table.createdBy, userId)} or ${eq(table.space, "team")})`
}

/** Where condition: `userId`'s own Private rows, the ones only they can see. */
export function inPrivateSpaceOf(table: SpacedTable, userId: string): SQL {
  return sql`(${eq(table.createdBy, userId)} and ${eq(table.space, "private")})`
}

/** The columns the access rule reads. */
export type AccessRow = { space: Space; createdBy: string | null }

/** The access rule for a row already in memory, such as a Room's drawing. */
export function canAccess(row: AccessRow, userId: string): boolean {
  return row.createdBy === userId || row.space === "team"
}
