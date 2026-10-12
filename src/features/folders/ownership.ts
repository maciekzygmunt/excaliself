import { and, eq, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { folders } from "@/db/schema"
import { isValidFolderTarget } from "./subtree"

type Db = Pick<NodePgDatabase<typeof schema>, "select">

/**
 * Rejects a folder id the caller may not place content into: one they don't
 * own, one in the trash, or (when moving a folder) itself or a descendant.
 * Throws "not found" so non-owners can't tell the folder exists.
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
    .where(and(eq(folders.ownerId, userId), isNull(folders.deletedAt)))
  if (!isValidFolderTarget(liveFolders, targetId, movingId)) {
    throw new Error("Folder not found")
  }
}
