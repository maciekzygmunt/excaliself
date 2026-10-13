// Persistence for the room image endpoint, kept out of the route so tests can use a fake db.

import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles } from "@/db/schema"
import { bytesToDataUrl, dataUrlToBytes } from "@/features/drawings/file-bytes"
import type { RoomFile, RoomFilePayload } from "./room-files"

type Db = NodePgDatabase<typeof schema>

/**
 * First write per fileId wins. The id hashes the pre-downscale file, so bytes
 * can't be verified against it. A concurrent duplicate row is harmless.
 */
export async function saveRoomFile(
  db: Db,
  drawingId: string,
  file: RoomFile,
  now: Date = new Date(),
): Promise<void> {
  const [existing] = await db
    .select({ fileId: drawingFiles.fileId })
    .from(drawingFiles)
    .where(
      and(
        eq(drawingFiles.drawingId, drawingId),
        eq(drawingFiles.fileId, file.fileId),
      ),
    )
  if (existing) return

  await db.insert(drawingFiles).values({
    id: randomUUID(),
    drawingId,
    fileId: file.fileId,
    mimeType: file.mimeType,
    bytes: dataUrlToBytes(file.dataUrl),
    createdAt: now,
  })
}

/** Scoped by drawing, so a token can't read another drawing's images. */
export async function loadRoomFile(
  db: Db,
  drawingId: string,
  fileId: string,
): Promise<RoomFilePayload | null> {
  const [row] = await db
    .select({
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      bytes: drawingFiles.bytes,
      createdAt: drawingFiles.createdAt,
    })
    .from(drawingFiles)
    .where(
      and(
        eq(drawingFiles.drawingId, drawingId),
        eq(drawingFiles.fileId, fileId),
      ),
    )
  if (!row) return null

  const created = row.createdAt ? new Date(row.createdAt).getTime() : 0
  return {
    fileId: row.fileId,
    mimeType: row.mimeType,
    dataUrl: bytesToDataUrl(row.mimeType, row.bytes),
    created: Number.isFinite(created) ? created : 0,
  }
}
