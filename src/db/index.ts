import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"

import { env } from "@/env"
import * as schema from "./schema.ts"

export const db = drizzle(env.DATABASE_URL, { schema })

migrate(db, { migrationsFolder: "./drizzle" })
  .then(() => console.log("Database migrations applied"))
  .catch((err) => {
    console.error("Database migration failed", err)
    process.exit(1)
  })
