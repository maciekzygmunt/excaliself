import type { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import type { Db } from "./index.ts"
import { seedDemoContent } from "./preview-seed.ts"
import * as schema from "./schema.ts"

/**
 * PR previews have no Postgres server. An in-memory PGlite runs the real
 * migrations and the real queries, then gets example content. State lives
 * for one process, which is enough to click through a PR.
 */
export async function createPreviewDb(): Promise<Db> {
  const startedAt = Date.now()
  console.warn("[preview] PREVIEW_MODE: in-process PGlite, no DATABASE_URL")
  const db = drizzle({ client: await loadPGlite(), schema })
  await migrate(db, { migrationsFolder: "./drizzle" })
  await seedDemoContent(db)
  console.warn(`[preview] PGlite ready in ${Date.now() - startedAt} ms`)
  return db
}

// PGlite reads its wasm and data files from beside its own module, so it must
// load from node_modules, not from a Nitro chunk. A runtime specifier is the
// one import form the bundler leaves alone.
async function loadPGlite(): Promise<PGlite> {
  const specifier = "@electric-sql/pglite"
  const { PGlite } = (await import(
    /* @vite-ignore */ specifier
  )) as typeof import("@electric-sql/pglite")
  return new PGlite()
}
