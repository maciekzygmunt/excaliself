"use server"

import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { drawings, folders } from "@/db/schema"
import { authMiddleware } from "@/middleware/auth"

/**
 * The trash page's data (spec §5.11): the owner's trash *units*, not raw
 * trashed rows. A drawing trashed on its own is a unit (trashRootId is its
 * own id); a trashed folder subtree is one unit represented by its root
 * folder plus a contents count — its children are never dispersed as loose
 * cards, so rows swept along by a folder trashing are only counted here.
 */
export const getTrashItems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id

    const [drawingUnits, folderUnits, trashedFolders, trashedDrawings] =
      await Promise.all([
        db
          .select()
          .from(drawings)
          .where(
            and(
              eq(drawings.ownerId, userId),
              isNotNull(drawings.deletedAt),
              eq(drawings.trashRootId, drawings.id),
            ),
          ),
        db
          .select()
          .from(folders)
          .where(
            and(
              eq(folders.ownerId, userId),
              isNotNull(folders.deletedAt),
              eq(folders.trashRootId, folders.id),
            ),
          ),
        db
          .select({ id: folders.id, trashRootId: folders.trashRootId })
          .from(folders)
          .where(
            and(eq(folders.ownerId, userId), isNotNull(folders.deletedAt)),
          ),
        db
          .select({ id: drawings.id, trashRootId: drawings.trashRootId })
          .from(drawings)
          .where(
            and(eq(drawings.ownerId, userId), isNotNull(drawings.deletedAt)),
          ),
      ])

    const countsByRoot = new Map<string, number>()
    const count = (rootId: string | null, selfId: string) => {
      // The unit root folder itself is a card, not part of its own count
      if (!rootId || rootId === selfId) return
      countsByRoot.set(rootId, (countsByRoot.get(rootId) ?? 0) + 1)
    }
    for (const folder of trashedFolders) count(folder.trashRootId, folder.id)
    for (const drawing of trashedDrawings)
      count(drawing.trashRootId, drawing.id)

    return {
      drawings: drawingUnits,
      folders: folderUnits.map((folder) => ({
        ...folder,
        itemCount: countsByRoot.get(folder.id) ?? 0,
      })),
    }
  })
