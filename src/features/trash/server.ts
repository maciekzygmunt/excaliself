"use server"

import { createServerFn } from "@tanstack/react-start"
import { and, eq, getTableColumns, isNotNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawings, folders, type Space, stars, users } from "@/db/schema"
import { userDisplayName } from "@/features/account/display-name"
import { drawingListColumns, starOf } from "@/features/drawings/list-columns"
import { accessibleTo, inPrivateSpaceOf } from "@/features/spaces/access"
import { authMiddleware } from "@/middleware/auth"
import { destroyTrashUnit } from "./destroy"

// The member who trashed a unit, joined on deletedBy. Null once deleted.
const trasherColumns = { name: users.name, email: users.email }

/** Swaps the joined trasher for their display name; emails stay on the server. */
function withTrasherName<
  T extends { trasher: { name: string; email: string } | null },
>({
  trasher,
  ...unit
}: T): Omit<T, "trasher"> & { deletedByName: string | null } {
  return { ...unit, deletedByName: trasher && userDisplayName(trasher) }
}

/**
 * The trash page's data (spec §5.11): the caller's trash *units*, not raw
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
          .select({ ...drawingListColumns, trasher: trasherColumns })
          .from(drawings)
          .leftJoin(stars, starOf(userId))
          .leftJoin(users, eq(users.id, drawings.deletedBy))
          .where(
            and(
              accessibleTo(drawings, userId),
              isNotNull(drawings.deletedAt),
              eq(drawings.trashRootId, drawings.id),
            ),
          ),
        db
          .select({ ...getTableColumns(folders), trasher: trasherColumns })
          .from(folders)
          .leftJoin(users, eq(users.id, folders.deletedBy))
          .where(
            and(
              accessibleTo(folders, userId),
              isNotNull(folders.deletedAt),
              eq(folders.trashRootId, folders.id),
            ),
          ),
        db
          .select({
            id: folders.id,
            trashRootId: folders.trashRootId,
            space: folders.space,
          })
          .from(folders)
          .where(
            and(accessibleTo(folders, userId), isNotNull(folders.deletedAt)),
          ),
        db
          .select({
            id: drawings.id,
            trashRootId: drawings.trashRootId,
            space: drawings.space,
          })
          .from(drawings)
          .where(
            and(accessibleTo(drawings, userId), isNotNull(drawings.deletedAt)),
          ),
      ])

    const isPrivate = (row: { space: Space }) => row.space === "private"
    const countsByRoot = new Map<string, number>()
    const drawingCountsByRoot = new Map<string, number>()
    const count = (
      map: Map<string, number>,
      rootId: string | null,
      selfId: string,
    ) => {
      // The unit root folder itself is a card, not part of its own count
      if (!rootId || rootId === selfId) return
      map.set(rootId, (map.get(rootId) ?? 0) + 1)
    }
    for (const folder of trashedFolders)
      count(countsByRoot, folder.trashRootId, folder.id)
    for (const drawing of trashedDrawings) {
      count(countsByRoot, drawing.trashRootId, drawing.id)
      count(drawingCountsByRoot, drawing.trashRootId, drawing.id)
    }

    return {
      drawings: drawingUnits.map(withTrasherName),
      folders: folderUnits.map(withTrasherName).map((folder) => ({
        ...folder,
        itemCount: countsByRoot.get(folder.id) ?? 0,
        // Drawings-only slice of itemCount, for count-aware danger copy
        drawingCount: drawingCountsByRoot.get(folder.id) ?? 0,
      })),
      // Every trashed private row (subtree members included) — what Empty
      // trash would destroy, for its count-aware danger dialog (spec §4.5).
      totals: {
        drawings: trashedDrawings.filter(isPrivate).length,
        folders: trashedFolders.filter(isPrivate).length,
      },
    }
  })

/**
 * Delete forever for one trash unit (spec §5.11, §4.5 tier 2). The actual
 * delete lives in destroyTrashUnit (see destroy.ts), which also evacuates
 * other trash units nested inside a folder unit so the FK cascade cannot
 * take them down with it.
 */
export const deleteTrashUnitForever = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: id, context }) => {
    await destroyTrashUnit(db, context.session.user.id, id)
  })

/**
 * Empty trash (spec §5.11): hard-deletes every trashed row in the caller's
 * Private space, freeing embedded drawing_files via FK cascade. Team trash is
 * everyone's, so it is never emptied in one go. Idempotent — an already empty
 * trash is a no-op, not an error (the UI hides the action anyway).
 */
export const emptyTrash = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id

    await db.transaction(async (tx) => {
      // Same ordering rationale as deleteTrashUnitForever. No live drawing
      // ever points into a trashed folder (trashing sweeps the subtree;
      // restore pulls drawings out), so the folder cascade frees nothing live.
      await tx
        .delete(drawings)
        .where(
          and(
            inPrivateSpaceOf(drawings, userId),
            isNotNull(drawings.deletedAt),
          ),
        )
      await tx
        .delete(folders)
        .where(
          and(inPrivateSpaceOf(folders, userId), isNotNull(folders.deletedAt)),
        )
    })
  })
