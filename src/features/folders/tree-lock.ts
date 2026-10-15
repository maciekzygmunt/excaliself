import { sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"

// Any fixed number; no other advisory lock in the app.
const FOLDER_TREE_KEY = 7340211

type Db = NodePgDatabase<typeof schema>
/** A transaction, never the plain db: the lock lasts until it commits. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * The folder tree lock, held to the end of the transaction. Take it first,
 * before the reads the write depends on.
 * - "change": re-parents, trashes, restores or moves a folder to Team. Runs
 *   alone, so cycle and subtree checks see every other change.
 * - "place": puts a row into a folder. Runs with other placements, never
 *   during a change, so the target folder stays live and in its space.
 */
export async function lockFolderTree(tx: Tx, mode: "change" | "place") {
  await tx.execute(
    mode === "change"
      ? sql`select pg_advisory_xact_lock(${FOLDER_TREE_KEY})`
      : sql`select pg_advisory_xact_lock_shared(${FOLDER_TREE_KEY})`,
  )
}
