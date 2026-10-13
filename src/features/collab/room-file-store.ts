// Persistence for the room image endpoint, kept out of the route so tests can use a fake db.

import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles } from "@/db/schema"
import { bytesToDataUrl, dataUrlToBytes } from "@/features/drawings/file-bytes"
import {
  MAX_DRAWING_IMAGE_BYTES,
  type RoomFile,
  type RoomFilePayload,
} from "./room-files"

type Db = NodePgDatabase<typeof schema>

/** Image bytes the drawing stores now. Also runs inside a transaction. */
export async function storedImageBytes(
  db: Pick<Db, "select">,
  drawingId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql`coalesce(sum(octet_length(${drawingFiles.bytes})), 0)`.mapWith(
        Number,
      ),
    })
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, drawingId))
  return row?.total ?? 0
}

/**
 * First write per fileId wins. The id hashes the pre-downscale file, so bytes
 * can't be verified against it. A concurrent duplicate row is harmless.
 * `full`: the image would take the drawing over `MAX_DRAWING_IMAGE_BYTES`.
 */
export async function saveRoomFile(
  db: Db,
  drawingId: string,
  file: RoomFile,
  now: Date = new Date(),
): Promise<"stored" | "full"> {
  const [existing] = await db
    .select({ fileId: drawingFiles.fileId })
    .from(drawingFiles)
    .where(
      and(
        eq(drawingFiles.drawingId, drawingId),
        eq(drawingFiles.fileId, file.fileId),
      ),
    )
  if (existing) return "stored"

  // Not atomic: parallel uploads can pass together; the rate limit bounds that.
  const bytes = dataUrlToBytes(file.dataUrl)
  const stored = await storedImageBytes(db, drawingId)
  if (stored + bytes.length > MAX_DRAWING_IMAGE_BYTES) return "full"

  await db.insert(drawingFiles).values({
    id: randomUUID(),
    drawingId,
    fileId: file.fileId,
    mimeType: file.mimeType,
    bytes,
    createdAt: now,
  })
  return "stored"
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
