import { randomBytes } from "node:crypto"
import { sql } from "drizzle-orm"
import type { Db } from "@/db"
import { demoAdmin } from "@/db/demo-content"
import { insertPreviewUser } from "@/db/preview-seed"
import { env } from "@/env"
import { startIntervalJob } from "@/lib/interval-job"
import { deleteExpiredVisitors } from "./visitors"

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000

/**
 * The public demo starts with no content: each visitor gets a copy. Its
 * admin has a password nobody knows, so /setup stays closed and nobody signs
 * in as admin. Every visitor is a member of this one instance, so Team would
 * be one public space, and an "anyone" link a public page. The database
 * refuses both, whatever path a request takes.
 */
export async function setUpDemoInstance(db: Db) {
  await insertPreviewUser(db, {
    ...demoAdmin,
    password: randomBytes(32).toString("base64url"),
    role: "admin",
  })
  await db.execute(
    sql`alter table drawings add constraint demo_no_team check (space <> 'team')`,
  )
  await db.execute(
    sql`alter table folders add constraint demo_no_team check (space <> 'team')`,
  )
  await db.execute(
    sql`alter table shares add constraint demo_members_only check (audience = 'members')`,
  )

  const retentionMs = env.DEMO_RETENTION_HOURS * 60 * 60 * 1000
  startIntervalJob("demo-cleanup", CLEANUP_INTERVAL_MS, async () => {
    const deleted = await deleteExpiredVisitors(
      db,
      new Date(Date.now() - retentionMs),
    )
    return deleted > 0 ? `deleted ${deleted} demo account(s)` : null
  })
}
