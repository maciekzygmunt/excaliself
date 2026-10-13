// Solo scene save, kept out of server.ts so tests can drive it with a fake db.

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
  /** Refused: the room owns the data. Not an error; the client joins it. */
  | { status: "shared" }

/**
 * Persist a solo edit. Unowned and missing ids both throw "Drawing not found",
 * so ownership can't be probed. Shared drawings are refused.
 */
export async function writeDrawingScene(
  db: Db,
  userId: string,
  input: { id: string; data: string; files: PersistedFileInput[] },
): Promise<SceneWriteResult> {
  const { id, data: sceneData, files } = input

  return db.transaction(async (tx) => {
    const now = new Date()

    // One query for both gates, so the share check never answers for a drawing
    // the caller doesn't own.
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

    // Re-check on the UPDATE: another tab may share the drawing in between.
    // The join-time reconcile covers what still slips through.
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
