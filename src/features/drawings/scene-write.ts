// Solo scene save, kept out of server.ts so tests can drive it with a fake db.

import { randomUUID } from "node:crypto"
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles, drawings, shares } from "@/db/schema"
import {
  parseFileUpload,
  type RoomFileUpload,
} from "@/features/collab/room-files"
import { dataUrlToBytes } from "./file-bytes"
import { parseSceneElements, sceneText } from "./search"

type Db = NodePgDatabase<typeof schema>

export type SceneWriteResult =
  /**
   * `missingFileIds`: live images with no stored bytes that this save didn't
   * carry either — the client believed they were stored. It resends them.
   */
  | { status: "saved"; missingFileIds: string[] }
  /** Refused: the room owns the data. Not an error; the client joins it. */
  | { status: "shared" }

/**
 * Persist a solo edit. Unowned and missing ids both throw "Drawing not found",
 * so ownership can't be probed. Shared drawings are refused.
 *
 * `files` carries only images the client has not stored yet. Ones that fail
 * the room upload's checks are skipped, not fatal: the client flags oversized
 * images itself, and one bad image must not block every later save.
 */
export async function writeDrawingScene(
  db: Db,
  userId: string,
  input: { id: string; data: string; files: RoomFileUpload[] },
): Promise<SceneWriteResult> {
  const { id, data: sceneData } = input
  const files = input.files.flatMap((upload) => {
    const parsed = parseFileUpload(upload.fileId, upload)
    return parsed.status === "ok" ? [parsed.file] : []
  })
  const elements = parseSceneElements(sceneData)

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
      .set({
        data: sceneData,
        searchText: sceneText(elements ?? []),
        updatedAt: now,
      })
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
    const referenced = elements && referencedFileIds(elements)
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
          bytes: dataUrlToBytes(file.dataUrl),
          createdAt: now,
        })),
      )
    }

    const stored = new Set([
      ...existingFileIds,
      ...filesToInsert.map((file) => file.fileId),
    ])
    const missingFileIds = [...(referenced ?? [])].filter(
      (fileId) => !stored.has(fileId),
    )
    return { status: "saved" as const, missingFileIds }
  })
}

/** File ids of live images in the scene. */
function referencedFileIds(
  elements: readonly Record<string, unknown>[],
): Set<string> {
  return new Set(
    elements.flatMap((el) =>
      el.type === "image" && !el.isDeleted && typeof el.fileId === "string"
        ? [el.fileId]
        : [],
    ),
  )
}
