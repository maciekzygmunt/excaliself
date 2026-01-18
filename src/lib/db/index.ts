import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    const databasePath = process.env.DATABASE_PATH || "./data/excalidraw.db";

    const dir = dirname(databasePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(databasePath);
    sqlite.pragma("journal_mode = WAL");

    db = drizzle(sqlite, { schema });
  }
  return db;
}

export { db };
