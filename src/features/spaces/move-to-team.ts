// The move-to-Team engine: the one path that takes a row across spaces, and
// only Private → Team (ADR 0002). Kept out of server.ts, which imports the
// live db, so tests can drive it with a fake db.

import { and, eq, inArray, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings, folders, shares } from "@/db/schema"
import { collectFolderSubtreeIds } from "@/features/folders/subtree"
import { accessibleTo, inPrivateSpaceOf } from "./access"

type Db = NodePgDatabase<typeof schema>

export type MoveItem = { type: "drawing" | "folder"; id: string }

/**
 * Moves one of the caller's live Private drawings or folders into Team, under
 * `targetFolderId` (a live Team folder) or at Team root when null. A folder
 * takes its whole subtree, trashed rows included, so a later restore never
 * lands a Private row under a Team folder. Creators are kept. `members` Share
 * links go (every member can now open it anyway); `anyone` links stay, so
 * guests keep their way in. Returns the moved drawing ids for the Handoff.
 */
export async function moveToTeam(
  db: Db,
  userId: string,
  item: MoveItem,
  targetFolderId: string | null,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    if (targetFolderId) {
      const [target] = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.id, targetFolderId),
            accessibleTo(folders, userId),
            eq(folders.space, "team"),
            isNull(folders.deletedAt),
          ),
        )
      if (!target) throw new Error("Folder not found")
    }

    let drawingIds: string[]
    if (item.type === "drawing") {
      const [drawing] = await tx
        .select({ id: drawings.id })
        .from(drawings)
        .where(
          and(
            eq(drawings.id, item.id),
            inPrivateSpaceOf(drawings, userId),
            isNull(drawings.deletedAt),
          ),
        )
      if (!drawing) throw new Error("Drawing not found")
      drawingIds = [drawing.id]

      await tx
        .update(drawings)
        .set({ space: "team", folderId: targetFolderId })
        .where(eq(drawings.id, drawing.id))
    } else {
      // Trashed rows too: they still sit in the subtree.
      const privateFolders = await tx
        .select({
          id: folders.id,
          parentId: folders.parentId,
          deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(inPrivateSpaceOf(folders, userId))
      const root = privateFolders.find((folder) => folder.id === item.id)
      if (!root || root.deletedAt) throw new Error("Folder not found")
      const folderIds = [...collectFolderSubtreeIds(privateFolders, item.id)]

      const subtreeDrawings = await tx
        .select({ id: drawings.id })
        .from(drawings)
        .where(
          and(
            inArray(drawings.folderId, folderIds),
            inPrivateSpaceOf(drawings, userId),
          ),
        )
      drawingIds = subtreeDrawings.map((drawing) => drawing.id)

      await tx
        .update(folders)
        .set({ space: "team" })
        .where(inArray(folders.id, folderIds))
      await tx
        .update(folders)
        .set({ parentId: targetFolderId })
        .where(eq(folders.id, item.id))
      if (drawingIds.length > 0)
        await tx
          .update(drawings)
          .set({ space: "team" })
          .where(inArray(drawings.id, drawingIds))
    }

    if (drawingIds.length > 0)
      await tx
        .delete(shares)
        .where(
          and(
            inArray(shares.drawingId, drawingIds),
            eq(shares.audience, "members"),
          ),
        )

    return drawingIds
  })
}
