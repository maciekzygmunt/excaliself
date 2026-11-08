// Version history: past scenes of a drawing, taken by both scene writers.

import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm"
import type { Db } from "@/db"
import {
  drawingFiles,
  drawings,
  drawingVersionFiles,
  drawingVersions,
} from "@/db/schema"
import { lockFolderTree, type Tx } from "@/features/folders/tree-lock"
import { accessibleTo } from "@/features/spaces/access"
import { MAX_NAME_LENGTH } from "./list-columns"
import { insertPreparedDrawing } from "./scene-import"
import { referencedFileIds } from "./scene-write"
import { sceneText } from "./search"

/** A pause this long between edits starts a new editing session. */
export const SESSION_GAP_MS = 10 * 60 * 1000
/** A long session still gets a version this often. */
export const CHECKPOINT_MS = 30 * 60 * 1000
export const MAX_VERSIONS = 50

/** The fileIds some version of the drawing uses. */
const versionFileIds = (drawingId: string) =>
  sql`(select unnest(${drawingVersions.fileIds}) from ${drawingVersions} where ${drawingVersions.drawingId} = ${drawingId})`

/**
 * Called by a scene writer before it overwrites `drawings.data`. Keeps the
 * stored scene as a version when an editing session starts or a checkpoint
 * is due. Locks the drawing row, so two writers can't both take one.
 */
export async function snapshotBeforeWrite(
  tx: Tx,
  drawingId: string,
  now: Date,
): Promise<void> {
  const [drawing] = await tx
    .select({ updatedAt: drawings.updatedAt, createdAt: drawings.createdAt })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
    .for("update")
  if (!drawing) return
  const [latest] = await tx
    .select({ id: drawingVersions.id, createdAt: drawingVersions.createdAt })
    .from(drawingVersions)
    .where(eq(drawingVersions.drawingId, drawingId))
    .orderBy(desc(drawingVersions.createdAt))
    .limit(1)
  const lastCheckpoint = latest?.createdAt ?? drawing.createdAt
  const sessionStart =
    now.getTime() - drawing.updatedAt.getTime() >= SESSION_GAP_MS
  const checkpointDue =
    now.getTime() - lastCheckpoint.getTime() >= CHECKPOINT_MS
  if (!sessionStart && !checkpointDue) return

  const [stored] = await tx
    .select({ data: drawings.data, updatedAt: drawings.updatedAt })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
  const version = stored && toVersion(stored.data)
  if (!version) return
  if (latest) {
    const [previous] = await tx
      .select({ data: drawingVersions.data })
      .from(drawingVersions)
      .where(eq(drawingVersions.id, latest.id))
    if (previous?.data === version.data) return
  }

  await tx.insert(drawingVersions).values({
    id: randomUUID(),
    drawingId,
    data: version.data,
    fileIds: version.fileIds,
    savedAt: stored.updatedAt,
    createdAt: now,
  })
  await pruneVersions(tx, drawingId)
}

/** The scene without tombstones. Null when unreadable or empty. */
function toVersion(data: string): { data: string; fileIds: string[] } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null
  const scene = parsed as Record<string, unknown>
  if (!Array.isArray(scene.elements)) return null
  const elements = (scene.elements as unknown[]).filter(
    (element): element is Record<string, unknown> =>
      typeof element === "object" &&
      element !== null &&
      !(element as { isDeleted?: unknown }).isDeleted,
  )
  if (elements.length === 0) return null
  return {
    data: JSON.stringify({ ...scene, elements }),
    fileIds: [...referencedFileIds(elements)],
  }
}

/** Keeps the newest `MAX_VERSIONS`, then drops images no version uses. */
async function pruneVersions(tx: Tx, drawingId: string) {
  const stale = tx
    .select({ id: drawingVersions.id })
    .from(drawingVersions)
    .where(eq(drawingVersions.drawingId, drawingId))
    .orderBy(desc(drawingVersions.createdAt), desc(drawingVersions.id))
    .offset(MAX_VERSIONS)
  await tx.delete(drawingVersions).where(inArray(drawingVersions.id, stale))
  await tx
    .delete(drawingVersionFiles)
    .where(
      and(
        eq(drawingVersionFiles.drawingId, drawingId),
        sql`${drawingVersionFiles.fileId} not in ${versionFileIds(drawingId)}`,
      ),
    )
}

/**
 * Call before deleting the drawing_files rows that `where` matches. Rows a
 * version still uses move to drawing_version_files instead of being lost.
 */
export async function keepVersionImages(
  tx: Tx,
  drawingId: string,
  where: SQL | undefined,
): Promise<void> {
  await tx
    .insert(drawingVersionFiles)
    .select(
      tx
        .select({
          drawingId: drawingFiles.drawingId,
          fileId: drawingFiles.fileId,
          mimeType: drawingFiles.mimeType,
          bytes: drawingFiles.bytes,
        })
        .from(drawingFiles)
        .where(
          and(
            eq(drawingFiles.drawingId, drawingId),
            where,
            sql`${drawingFiles.fileId} in ${versionFileIds(drawingId)}`,
          ),
        ),
    )
    .onConflictDoNothing()
}

/** A drawing's versions, newest first. Empty when the caller can't see it. */
export async function listDrawingVersions(
  db: Db,
  userId: string,
  drawingId: string,
): Promise<{ id: string; savedAt: Date }[]> {
  return db
    .select({ id: drawingVersions.id, savedAt: drawingVersions.savedAt })
    .from(drawingVersions)
    .innerJoin(drawings, eq(drawings.id, drawingVersions.drawingId))
    .where(
      and(
        eq(drawingVersions.drawingId, drawingId),
        accessibleTo(drawings, userId),
        isNull(drawings.deletedAt),
      ),
    )
    .orderBy(desc(drawingVersions.createdAt))
}

/** One version, joined to its drawing under the access rule. */
function accessibleVersion(db: Db | Tx, userId: string, versionId: string) {
  return db
    .select({
      data: drawingVersions.data,
      fileIds: drawingVersions.fileIds,
      drawingId: drawingVersions.drawingId,
      name: drawings.name,
    })
    .from(drawingVersions)
    .innerJoin(drawings, eq(drawings.id, drawingVersions.drawingId))
    .where(
      and(
        eq(drawingVersions.id, versionId),
        accessibleTo(drawings, userId),
        isNull(drawings.deletedAt),
      ),
    )
}

/** A version's scene JSON, for its preview. Null when the caller can't see it. */
export async function getDrawingVersionData(
  db: Db,
  userId: string,
  versionId: string,
): Promise<string | null> {
  const [version] = await accessibleVersion(db, userId, versionId)
  return version?.data ?? null
}

/**
 * Restores a version as a new Private drawing at the root, with its images.
 * Images whose bytes are gone show the placeholder.
 */
export async function restoreVersionAsCopy(
  db: Db,
  userId: string,
  versionId: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    await lockFolderTree(tx, "place")
    const [version] = await accessibleVersion(tx, userId, versionId)
    if (!version) throw new Error("Version not found")

    const fileColumns = {
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      bytes: drawingFiles.bytes,
    }
    const live = await tx
      .select(fileColumns)
      .from(drawingFiles)
      .where(
        and(
          eq(drawingFiles.drawingId, version.drawingId),
          inArray(drawingFiles.fileId, version.fileIds),
        ),
      )
    const kept = await tx
      .select({
        fileId: drawingVersionFiles.fileId,
        mimeType: drawingVersionFiles.mimeType,
        bytes: drawingVersionFiles.bytes,
      })
      .from(drawingVersionFiles)
      .where(
        and(
          eq(drawingVersionFiles.drawingId, version.drawingId),
          inArray(drawingVersionFiles.fileId, version.fileIds),
        ),
      )
    const files = new Map([...kept, ...live].map((file) => [file.fileId, file]))

    const scene = JSON.parse(version.data) as {
      elements: Record<string, unknown>[]
    }
    const elements = scene.elements.map((element) =>
      element.type === "image" && typeof element.fileId === "string"
        ? {
            ...element,
            status: files.has(element.fileId) ? "saved" : "error",
          }
        : element,
    )
    const now = new Date()
    return insertPreparedDrawing(
      tx,
      {
        data: JSON.stringify({ ...scene, elements }),
        searchText: sceneText(elements),
        files: [...files.values()],
        skippedImages: 0,
      },
      {
        name: `${version.name} (restored)`.slice(0, MAX_NAME_LENGTH),
        folderId: null,
        space: "private",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      },
    )
  })
}
