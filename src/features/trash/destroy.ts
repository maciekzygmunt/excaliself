// Hard-delete engine behind Delete forever (spec §5.11, §4.5 tier 2). Kept
// out of server.ts — which imports the live db — so tests can drive it with
// a fake db, mirroring purge.ts.

import { and, eq, inArray, isNotNull, not } from "drizzle-orm"
import type { Db } from "@/db"
import { drawings, folders } from "@/db/schema"
import { accessibleTo } from "@/features/spaces/access"

/**
 * Hard-deletes one trash unit: every row swept into it (matched by
 * trashRootId, so a folder unit takes its whole subtree) plus its embedded
 * drawing_files via the FK cascade from drawings. Only unit roots qualify;
 * ids of rows inside a unit (or live rows) delete nothing and throw
 * not-found.
 *
 * Rows trashed separately BEFORE the folder keep their own trashRootId
 * (see trashFolder) but still sit physically inside the folder's subtree,
 * and the schema's parentId/folderId cascades would take them down with the
 * unit. Same move as the purge job: after the unit's own drawings are
 * deleted, anything still inside the unit's folders belongs to another unit
 * (or was restored mid-flight), so its FK edge is severed — evacuated to
 * root — before the folder delete lets the cascade fire. Those survivors
 * keep their trash cards; restoring them lands at root, their parent chain
 * being gone. The evacuations are deliberately not access-scoped: any row
 * pointing into a doomed folder would otherwise be cascade-deleted.
 */
export async function destroyTrashUnit(
  db: Db,
  userId: string,
  unitId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The unit's folder rows, read before anything is deleted — the cascade
    // from these is what could otherwise take unrelated rows down.
    const unitFolders = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          accessibleTo(folders, userId),
          eq(folders.trashRootId, unitId),
          isNotNull(folders.deletedAt),
        ),
      )
    const unitFolderIds = unitFolders.map((folder) => folder.id)

    // Drawings first: folder deletion would cascade into them anyway, but
    // the explicit statement keeps the freed rows access-scoped and audited
    // here rather than implied by FK order. The WHERE re-checks deletedAt,
    // so a drawing restored concurrently is skipped (and evacuated below).
    const deletedDrawings = await tx
      .delete(drawings)
      .where(
        and(
          accessibleTo(drawings, userId),
          eq(drawings.trashRootId, unitId),
          isNotNull(drawings.deletedAt),
        ),
      )
      .returning({ id: drawings.id })

    if (unitFolderIds.length > 0) {
      // Folders of other trash units parented inside this unit's subtree.
      await tx
        .update(folders)
        .set({ parentId: null })
        .where(
          and(
            inArray(folders.parentId, unitFolderIds),
            not(inArray(folders.id, unitFolderIds)),
          ),
        )
      // Every drawing still inside the unit's folders after the delete
      // above — other units' drawings, or one restored mid-flight — so no
      // deletedAt/trashRootId filter here.
      await tx
        .update(drawings)
        .set({ folderId: null })
        .where(inArray(drawings.folderId, unitFolderIds))
    }

    const deletedFolders = await tx
      .delete(folders)
      .where(
        and(
          accessibleTo(folders, userId),
          eq(folders.trashRootId, unitId),
          isNotNull(folders.deletedAt),
        ),
      )
      .returning({ id: folders.id })

    if (deletedDrawings.length === 0 && deletedFolders.length === 0)
      throw new Error("Trash item not found")
  })
}
