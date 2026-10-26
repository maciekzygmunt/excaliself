import { and, isNull } from "drizzle-orm"
import { folders, type Space } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"
import { isValidFolderTarget } from "./subtree"
import type { Tx } from "./tree-lock"

/** A folder the caller can't place content into, or that doesn't exist. */
export class FolderNotFoundError extends Error {
  constructor() {
    super("Folder not found")
  }
}

/**
 * Rejects a folder id the caller may not place content into: one they can't
 * access, one in the trash, or (when moving a folder) itself or a descendant.
 * Throws "not found" so others can't tell a private folder exists.
 *
 * Returns the folder's space. Content created in it takes that space, and
 * content moved into it must already be in it: only the move-to-Team engine
 * crosses spaces.
 *
 * Call it under lockFolderTree, so the answer holds until the write commits.
 */
export async function assertFolderTarget(
  tx: Tx,
  userId: string,
  targetId: string,
  movingId?: string,
): Promise<Space> {
  const liveFolders = await tx
    .select({
      id: folders.id,
      parentId: folders.parentId,
      space: folders.space,
    })
    .from(folders)
    .where(and(accessibleTo(folders, userId), isNull(folders.deletedAt)))
  const target = liveFolders.find((folder) => folder.id === targetId)
  if (!target || !isValidFolderTarget(liveFolders, targetId, movingId)) {
    throw new FolderNotFoundError()
  }
  return target.space
}
