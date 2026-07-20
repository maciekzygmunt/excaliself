// 30-day trash auto-purge (spec §5.11): hard-deletes anything past
// deletedAt + TRASH_RETENTION_DAYS, freeing embedded drawing_files via the
// drawings FK cascade. Started from src/db/index.ts at server boot — no
// external cron — and repeated on an interval, so purge-overdue items left
// over from downtime are caught on the next boot.

import { and, gt, inArray, isNull, lte, or } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings, folders } from "@/db/schema"
import { purgeCutoff } from "./retention"

export const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000 // hourly

type Db = NodePgDatabase<typeof schema>

export type PurgeCounts = { purgedDrawings: number; purgedFolders: number }

type FolderRow = { id: string; parentId: string | null; deletedAt: Date | null }

/**
 * Splits folders into the expired set (trashed past the cutoff — to be
 * hard-deleted) and the survivors that sit directly under an expired folder
 * and must be re-parented to root first. Severing that FK edge is what keeps
 * the folders self-FK cascade from taking live rows (or trash still inside
 * its retention window, e.g. a unit trashed after a partial restore) down
 * with an expired parent. Expired descendants of expired folders need no
 * re-parenting — the cascade removing them is the point.
 */
export function splitExpiredFolders(
  rows: FolderRow[],
  cutoff: Date,
): { expiredIds: string[]; reparentIds: string[] } {
  const isExpired = (row: FolderRow) =>
    row.deletedAt !== null && row.deletedAt.getTime() <= cutoff.getTime()

  const expired = new Set<string>()
  for (const row of rows) if (isExpired(row)) expired.add(row.id)

  const reparentIds = rows
    .filter(
      (row) =>
        !expired.has(row.id) &&
        row.parentId !== null &&
        expired.has(row.parentId),
    )
    .map((row) => row.id)

  return { expiredIds: [...expired], reparentIds }
}

/**
 * One purge pass: hard-deletes every drawing and folder whose trash window
 * has lapsed (deletedAt on or before `now` minus the retention window).
 *
 * Anything trashed as part of an expired unit was trashed at or before the
 * unit's own deletedAt, so "delete where deletedAt <= cutoff" takes an
 * expired folder's still-trashed subtree with it in the same pass. Surviving
 * rows whose FK points into the expired set (a drawing restored out of a
 * trashed subtree, a folder restored or re-trashed later) are re-parented to
 * root before the deletes so no cascade ever purges something still live.
 */
export async function purgeExpiredTrash(
  db: Db,
  now: Date = new Date(),
): Promise<PurgeCounts> {
  const cutoff = purgeCutoff(now)

  return db.transaction(async (tx) => {
    const folderRows = await tx
      .select({
        id: folders.id,
        parentId: folders.parentId,
        deletedAt: folders.deletedAt,
      })
      .from(folders)
    const { expiredIds, reparentIds } = splitExpiredFolders(folderRows, cutoff)

    if (reparentIds.length > 0) {
      await tx
        .update(folders)
        .set({ parentId: null })
        .where(inArray(folders.id, reparentIds))
    }
    if (expiredIds.length > 0) {
      // Surviving drawings inside expired folders: live ones (restored out of
      // the trashed subtree) and trash still inside its own window.
      await tx
        .update(drawings)
        .set({ folderId: null })
        .where(
          and(
            inArray(drawings.folderId, expiredIds),
            or(isNull(drawings.deletedAt), gt(drawings.deletedAt, cutoff)),
          ),
        )
    }

    // Deleting drawings explicitly (rather than via the folder cascade) keeps
    // the purged count exact; drawing_files rows cascade off each drawing.
    const purgedDrawings = await tx
      .delete(drawings)
      .where(lte(drawings.deletedAt, cutoff))
      .returning({ id: drawings.id })

    const purgedFolders =
      expiredIds.length > 0
        ? await tx
            .delete(folders)
            .where(inArray(folders.id, expiredIds))
            .returning({ id: folders.id })
        : []

    return {
      purgedDrawings: purgedDrawings.length,
      purgedFolders: purgedFolders.length,
    }
  })
}

/**
 * Runs a purge pass immediately and then on an interval. Failures are logged
 * and never break the schedule; every pass logs its counts for the
 * self-hosting admin. Returns a stop function (used by tests).
 */
export function startTrashPurgeJob(
  runPass: () => Promise<PurgeCounts>,
  intervalMs: number = TRASH_PURGE_INTERVAL_MS,
): () => void {
  const pass = async () => {
    try {
      const { purgedDrawings, purgedFolders } = await runPass()
      console.log(
        `[trash-purge] pass complete: purged ${purgedDrawings} drawing(s), ${purgedFolders} folder(s)`,
      )
    } catch (err) {
      console.error("[trash-purge] pass failed", err)
    }
  }

  void pass()
  const timer = setInterval(pass, intervalMs)
  // Typed by the DOM lib as a number, but at runtime this is a Node Timeout;
  // unref it so the job never holds the process open (graceful shutdown).
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
}
