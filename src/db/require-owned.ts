import { and, eq } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import type { db } from "@/db"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbOrTx = typeof db | Tx

type OwnedTable = PgTable & {
  id: AnyPgColumn
  ownerId: AnyPgColumn
}

export async function requireOwned(
  tx: DbOrTx,
  table: OwnedTable,
  id: string,
  userId: string,
  resourceLabel: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.ownerId, userId)))
  // Treat "not owned" as "not found" to avoid leaking resource existence to non-owners.
  if (!row) throw new Error(`${resourceLabel} not found`)
}
