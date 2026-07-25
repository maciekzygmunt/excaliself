// Persistence for the room-scoped image endpoint (canvas sharing spec §2.4).
// Kept out of the route — which imports the live db — so the rules below are
// drivable by tests with a fake db, mirroring scene-store.ts.

import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles } from "@/db/schema"
import type { RoomFile, RoomFilePayload } from "./room-files"

type Db = NodePgDatabase<typeof schema>

/**
 * Writes the row the moment the blob lands — before the uploader's element is
 * allowed to flip to `status: "saved"`, so a peer reacting to that flip always
 * finds bytes waiting (spec §2.4).
 *
 * `fileId` is a content hash upstream, so an id the drawing already holds is
 * the same image and the existing row stands. Two peers pasting the same
 * picture at the same instant can race the check and leave a duplicate row;
 * both read back identically, and the solo save path's delete-by-fileId
 * removes them together. A unique index would be the tighter fix, and the
 * price is a migration for a collision that changes nothing.
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
    dataUrl: file.dataUrl,
    createdAt: now,
  })
}

/**
 * One blob, scoped to the room asking for it: a token for drawing A can never
 * read drawing B's images, whatever fileId it names.
 */
export async function loadRoomFile(
  db: Db,
  drawingId: string,
  fileId: string,
): Promise<RoomFilePayload | null> {
  const [row] = await db
    .select({
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      dataUrl: drawingFiles.dataUrl,
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
    dataUrl: row.dataUrl,
    created: Number.isFinite(created) ? created : 0,
  }
}
