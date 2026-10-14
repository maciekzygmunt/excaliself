import { and, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { folders } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { isValidFolderTarget } from "./subtree"

type Db = Pick<NodePgDatabase<typeof schema>, "select">

/**
 * Rejects a folder id the caller may not place content into: one they can't
 * access, one in the trash, or (when moving a folder) itself or a descendant.
 * Throws "not found" so others can't tell a private folder exists.
 */
export async function assertFolderTarget(
  db: Db,
  userId: string,
  targetId: string,
  movingId?: string,
): Promise<void> {
  const liveFolders = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(accessibleTo(folders, userId), isNull(folders.deletedAt)))
  if (!isValidFolderTarget(liveFolders, targetId, movingId)) {
    throw new Error("Folder not found")
  }
}
