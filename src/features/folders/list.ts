// The folder list behind the sidebar and the MCP tools. Kept out of server.ts
// so the MCP endpoint can share it.

import { and, asc, isNull } from "drizzle-orm"
import type { Db } from "@/db"
import { folders } from "@/db/schema"
import { folderColumns } from "@/features/drawings/list-columns"
import { accessibleTo } from "@/features/spaces/access"

/** Every untrashed folder `userId` can see, in both spaces, by name. */
export function listFolders(db: Db, userId: string) {
  return db
    .select(folderColumns)
    .from(folders)
    .where(and(accessibleTo(folders, userId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.name))
}
