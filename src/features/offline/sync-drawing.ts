import { createHash, randomUUID } from "node:crypto"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Db } from "@/db"
import { drawingFiles, drawings, shares } from "@/db/schema"
import {
  MAX_DRAWING_IMAGE_BYTES,
  parseFileUpload,
} from "@/features/collab/room-files"
import { dataUrlToBytes } from "@/features/drawings/file-bytes"
import { referencedFileIds } from "@/features/drawings/scene-files"
import { parseSceneElements, sceneText } from "@/features/drawings/search"
import type { Tx } from "@/features/folders/tree-lock"
import { inPrivateSpaceOf } from "@/features/spaces/access"
import type { SyncRequest, SyncResult } from "./types"

export function sceneRevision(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

function prepareImages(
  drawingId: string,
  referenced: Set<string>,
  files: SyncRequest["scene"]["files"],
  stored: ReadonlyMap<string, number>,
) {
  const uploads = new Map(files.map((file) => [file.fileId, file]))
  const rows: (typeof drawingFiles.$inferInsert)[] = []
  let budget = MAX_DRAWING_IMAGE_BYTES
  for (const fileId of referenced) budget -= stored.get(fileId) ?? 0
  const overCapFileIds: string[] = []
  const missingFileIds: string[] = []
  for (const fileId of referenced) {
    if (stored.has(fileId)) continue
    const upload = uploads.get(fileId)
    if (!upload) {
      missingFileIds.push(fileId)
      continue
    }
    const parsed = parseFileUpload(fileId, upload, MAX_DRAWING_IMAGE_BYTES)
    if (parsed.status === "invalid") return { status: "images" } as const
    const bytes =
      parsed.status === "ok" ? dataUrlToBytes(parsed.file.dataUrl) : null
    if (!bytes || parsed.status !== "ok" || bytes.length > budget) {
      overCapFileIds.push(fileId)
      continue
    }
    budget -= bytes.length
    rows.push({
      id: randomUUID(),
      drawingId,
      fileId,
      bytes,
      mimeType: parsed.file.mimeType,
    })
  }
  if (missingFileIds.length)
    return { status: "images", missingFileIds } as const
  return overCapFileIds.length
    ? ({ status: "images", overCapFileIds } as const)
    : ({ status: "ok", rows } as const)
}

async function storeImages(tx: Tx, rows: (typeof drawingFiles.$inferInsert)[]) {
  if (rows.length > 0) await tx.insert(drawingFiles).values(rows)
}

/** Commit the scene and its images together, conditional on the version opened. */
export async function syncPrivateDrawing(
  db: Db,
  owner: string,
  input: SyncRequest,
): Promise<SyncResult> {
  const { id, name, baseRevision, scene } = input
  const elements = parseSceneElements(scene.data)
  if (!elements) return { status: "invalid" }
  const referenced = referencedFileIds(
    elements.filter((element) => element.status !== "error"),
  )
  const revision = sceneRevision(scene.data)

  return db.transaction(async (tx) => {
    const fields = {
      data: scene.data,
      searchText: sceneText(elements),
      updatedAt: new Date(),
    }

    // Offline-created drawings use the browser's UUID. Retrying after a lost
    // response reuses it, so a successful insert can never create duplicates.
    if (baseRevision === null) {
      const images = prepareImages(id, referenced, scene.files, new Map())
      if (images.status !== "ok") return images
      const inserted = await tx
        .insert(drawings)
        .values({ ...fields, id, name, space: "private", createdBy: owner })
        .onConflictDoNothing({ target: drawings.id })
        .returning({ id: drawings.id })
      if (inserted.length > 0) {
        await storeImages(tx, images.rows)
        return { status: "saved", revision }
      }
    }

    // Hold the row lock through the commit. Share creation takes a shared
    // lock on the same drawing, so it can't start between the check and save.
    const [current] = await tx
      .select({ data: drawings.data })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, id),
          inPrivateSpaceOf(drawings, owner),
          isNull(drawings.deletedAt),
        ),
      )
      .for("update")
    if (!current) return { status: "conflict" }
    const [share] = await tx
      .select({ id: shares.id })
      .from(shares)
      .where(eq(shares.drawingId, id))
    if (share) return { status: "conflict" }
    const alreadyWritten = current.data === scene.data
    if (!alreadyWritten && sceneRevision(current.data) !== baseRevision)
      return { status: "conflict" }

    const existing = await tx
      .select({
        id: drawingFiles.fileId,
        length: sql<number>`octet_length(${drawingFiles.bytes})`,
      })
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, id))
    const stored = new Map(existing.map(({ id, length }) => [id, length]))
    const images = prepareImages(id, referenced, scene.files, stored)
    if (images.status !== "ok") return images

    // An identical scene with all its images may be a retry of a committed
    // request. A stale request may acknowledge it, but can't repair it.
    if (alreadyWritten && images.rows.length === 0)
      return { status: "saved", revision }
    if (alreadyWritten && revision !== baseRevision)
      return { status: "conflict" }

    await tx.update(drawings).set(fields).where(eq(drawings.id, id))
    const removed = [...stored.keys()].filter(
      (fileId) => !referenced.has(fileId),
    )
    if (removed.length > 0) {
      await tx
        .delete(drawingFiles)
        .where(
          and(
            eq(drawingFiles.drawingId, id),
            inArray(drawingFiles.fileId, removed),
          ),
        )
    }
    await storeImages(tx, images.rows)
    return { status: "saved", revision }
  })
}
