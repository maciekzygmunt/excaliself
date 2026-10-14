import { and, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { folders, type Space } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { isValidFolderTarget } from "./subtree"

type Db = Pick<NodePgDatabase<typeof schema>, "select">

/**
 * Rejects a folder id the caller may not place content into: one they can't
 * access, one in the trash, or (when moving a folder) itself or a descendant.
 * Throws "not found" so others can't tell a private folder exists.
 *
 * Returns the folder's space. Content created in it takes that space, and
 * content moved into it must already be in it: only the move-to-Team engine
 * crosses spaces.
 */
export async function assertFolderTarget(
  db: Db,
  userId: string,
  targetId: string,
  movingId?: string,
): Promise<Space> {
  const liveFolders = await db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      space: folders.space,
    })
    .from(folders)
    .where(and(accessibleTo(folders, userId), isNull(folders.deletedAt)))
  const target = liveFolders.find((folder) => folder.id === targetId)
  if (!target || !isValidFolderTarget(liveFolders, targetId, movingId)) {
    throw new Error("Folder not found")
  }
  return target.space
}
