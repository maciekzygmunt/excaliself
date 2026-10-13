// The classic (solo) scene save (canvas sharing spec §5.5). Kept out of
// server.ts — which imports the live db — so the ownership, trash, and
// share guards are drivable by tests with a fake db, mirroring
// shares/store.ts.

import { randomUUID } from "node:crypto"
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles, drawings, shares } from "@/db/schema"

type Db = NodePgDatabase<typeof schema>

export type PersistedFileInput = {
  fileId: string
  mimeType: string
  dataUrl: string
}

export type SceneWriteResult =
  | { status: "saved" }
  /**
   * The drawing is shared, so the socket path owns its data (spec §5.5) and
   * this write was refused. Not an error: a tab that has not noticed the share
   * yet is a normal state, and the client answers by joining the room rather
   * than by showing a failure.
   */
  | { status: "shared" }

/**
 * Persist a solo edit. Throws "Drawing not found" for anything the caller
 * doesn't own — the same answer a nonexistent id gets, so ownership can't be
 * probed — and refuses trashed drawings and shared ones.
 *
 * The share check is the server-side half of "shared ⇒ always collab"
 * (spec §5.5): while a `shares` row exists, the Room is the only writer, and
 * a stale tab still running classic autosave would otherwise overwrite live
 * collaborative work with whatever scene it happened to be holding.
 */
export async function writeDrawingScene(
  db: Db,
  userId: string,
  input: { id: string; data: string; files: PersistedFileInput[] },
): Promise<SceneWriteResult> {
  const { id, data: sceneData, files } = input

  return db.transaction(async (tx) => {
    const now = new Date()

    // One statement for both gates, so the share check can never answer for a
    // drawing the caller doesn't own: no row means "not found" whether the id
    // is unknown, someone else's, or trashed. Refusing writes to trashed
    // drawings is permanent — even now that they open read-only (#53).
    const [target] = await tx
      .select({ id: drawings.id, shareId: shares.id })
      .from(drawings)
      .leftJoin(shares, eq(shares.drawingId, drawings.id))
      .where(
        and(
          eq(drawings.id, id),
          eq(drawings.ownerId, userId),
          isNull(drawings.deletedAt),
        ),
      )
    if (!target) throw new Error("Drawing not found")
    if (target.shareId) return { status: "shared" as const }

    // The no-share condition rides on the UPDATE as well, not just the gate
    // above: another tab of the owner's can mint a link between the two, and
    // this write would then land on a drawing the Room had already loaded.
    // Zero rows means exactly that happened.
    //
    // It narrows the window rather than closing it — a share created after
    // this statement takes its snapshot still slips through. That residue is
    // what spec §5.5's "join-time reconcile is the safety net" covers: this
    // tab joins the room moments later and pushes the scene it is holding,
    // so the edits arrive by the socket instead of being lost.
    const written = await tx
      .update(drawings)
      .set({ data: sceneData, updatedAt: now })
      .where(
        and(
          eq(drawings.id, id),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(shares)
              .where(eq(shares.drawingId, id)),
          ),
        ),
      )
      .returning({ id: drawings.id })
    if (written.length === 0) return { status: "shared" as const }

    const existing = await tx
      .select({ fileId: drawingFiles.fileId })
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, id))
    const existingFileIds = new Set(existing.map((row) => row.fileId))
    // Drop only files no live image uses. The payload can miss some: a tab
    // that hasn't fetched a guest's upload yet still keeps its image.
    const referenced = referencedFileIds(sceneData)
    const fileIdsToRemove = referenced
      ? [...existingFileIds].filter((fileId) => !referenced.has(fileId))
      : []
    const filesToInsert = files.filter(
      (file) => !existingFileIds.has(file.fileId),
    )

    if (fileIdsToRemove.length > 0) {
      await tx
        .delete(drawingFiles)
        .where(
          and(
            eq(drawingFiles.drawingId, id),
            inArray(drawingFiles.fileId, fileIdsToRemove),
          ),
        )
    }

    if (filesToInsert.length > 0) {
      await tx.insert(drawingFiles).values(
        filesToInsert.map((file) => ({
          id: randomUUID(),
          drawingId: id,
          fileId: file.fileId,
          mimeType: file.mimeType,
          dataUrl: file.dataUrl,
          createdAt: now,
        })),
      )
    }

    return { status: "saved" as const }
  })
}

type StoredElement = { type?: string; isDeleted?: boolean; fileId?: string }

/** File ids of live images in the scene; null if it can't be parsed. */
function referencedFileIds(sceneData: string): Set<string> | null {
  try {
    const { elements } = JSON.parse(sceneData) as {
      elements?: StoredElement[]
    }
    return new Set(
      (elements ?? []).flatMap((el) =>
        el.type === "image" && !el.isDeleted && el.fileId ? [el.fileId] : [],
      ),
    )
  } catch {
    return null
  }
}
