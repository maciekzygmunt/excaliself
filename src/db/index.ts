import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

import { env } from "@/env"
import { purgeExpiredTrash, startTrashPurgeJob } from "@/features/trash/purge"
import { processSingleton } from "@/lib/process-singleton"
import * as schema from "./schema.ts"

async function connect() {
  const db = drizzle(env.DATABASE_URL, { schema })

  try {
    await migrate(db, { migrationsFolder: "./drizzle" })
    console.log("Database migrations applied")
  } catch (err) {
    console.error("Database migration failed", err)
    process.exit(1)
  }

  // First background job: 30-day trash auto-purge. Runs once now (catching
  // anything that went purge-overdue while the server was down) and then
  // hourly, with no external cron.
  startTrashPurgeJob(() => purgeExpiredTrash(db))
  return db
}

// Both bundles include this module, and each loads on its first request. One
// promise per process means one pool, one migration run, and one purge job;
// a bundle that loads mid-migration waits for it.
export const db = await processSingleton("db", connect)
