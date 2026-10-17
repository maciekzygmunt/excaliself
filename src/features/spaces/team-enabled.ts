// Whether the UI shows Team at all. A UI gate only: server functions apply
// the access rule regardless. Kept out of server.ts so tests can drive it
// with a fake db.

import { count, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings, folders, users } from "@/db/schema"

type Db = Pick<NodePgDatabase<typeof schema>, "select">

/**
 * True once the instance has a second member, or Team holds anything,
 * trashed rows included, so a last remaining member can still reach it.
 */
export async function isTeamEnabled(db: Db): Promise<boolean> {
  const [[members], teamDrawings, teamFolders] = await Promise.all([
    db.select({ count: count() }).from(users),
    db
      .select({ id: drawings.id })
      .from(drawings)
      .where(eq(drawings.space, "team"))
      .limit(1),
    db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.space, "team"))
      .limit(1),
  ])
  return members.count > 1 || teamDrawings.length > 0 || teamFolders.length > 0
}
