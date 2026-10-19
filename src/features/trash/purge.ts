// 30-day trash auto-purge (spec §5.11): hard-deletes anything past
// deletedAt + TRASH_RETENTION_DAYS, freeing embedded drawing_files via the
// drawings FK cascade. Started from src/db/index.ts at server boot — no
// external cron — and repeated on an interval, so purge-overdue items left
// over from downtime are caught on the next boot.

import { and, inArray, lte } from "drizzle-orm"
import type { Db } from "@/db"
import { drawings, folders } from "@/db/schema"
import { purgeCutoff } from "./retention"

export const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000 // hourly

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
 *
 * Concurrency: under READ COMMITTED a restore can commit between our reads
 * and our writes, clearing deletedAt — and an ID-only delete would then
 * cascade over the freshly restored rows. Guards, in order: the folder rows
 * are locked FOR UPDATE for the whole pass (a concurrent folder restore
 * blocks, then sees the purged rows as gone — the same outcome as restoring
 * a moment after the purge); the drawings delete re-evaluates deletedAt at
 * delete time, so a drawing restored before the delete reaches it is
 * skipped; and every drawing still inside an expired folder after that
 * delete — including one restored mid-pass — is re-parented to root before
 * the folder cascade fires.
 */
export async function purgeExpiredTrash(
  db: Db,
  now: Date = new Date(),
): Promise<PurgeCounts> {
  const cutoff = purgeCutoff(now)

  return db.transaction(async (tx) => {
    // FOR UPDATE freezes every folder's deletedAt/parentId for the pass, so
    // the sets computed below stay true through the deletes; it also blocks
    // inserts of new children under a folder that is about to be purged
    // (the FK check needs a share lock this transaction already holds).
    const folderRows = await tx
      .select({
        id: folders.id,
        parentId: folders.parentId,
        deletedAt: folders.deletedAt,
      })
      .from(folders)
      .for("update")
    const { expiredIds, reparentIds } = splitExpiredFolders(folderRows, cutoff)

    if (reparentIds.length > 0) {
      await tx
        .update(folders)
        .set({ parentId: null })
        .where(inArray(folders.id, reparentIds))
    }

    // Deleting drawings explicitly (rather than via the folder cascade) keeps
    // the purged count exact; drawing_files rows cascade off each drawing.
    // The WHERE re-checks deletedAt against the latest committed version of
    // each row, so a concurrently restored drawing is skipped.
    const purgedDrawings = await tx
      .delete(drawings)
      .where(lte(drawings.deletedAt, cutoff))
      .returning({ id: drawings.id })

    let purgedFolders: { id: string }[] = []
    if (expiredIds.length > 0) {
      // Anything still inside an expired folder after the delete above
      // survived it — live drawings, trash inside its own window, or a
      // drawing whose restore landed mid-pass — so sever the FK edge before
      // the folder cascade can take it.
      await tx
        .update(drawings)
        .set({ folderId: null })
        .where(inArray(drawings.folderId, expiredIds))

      // The rows are locked, but re-assert the expiry predicate anyway so a
      // restored folder can never be hard-deleted even if the locking above
      // is ever weakened; the count reflects the rows actually deleted.
      purgedFolders = await tx
        .delete(folders)
        .where(
          and(inArray(folders.id, expiredIds), lte(folders.deletedAt, cutoff)),
        )
        .returning({ id: folders.id })
    }

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
