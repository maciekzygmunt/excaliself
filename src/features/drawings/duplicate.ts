// The "Duplicate" menu action, kept out of server.ts so tests can drive it.

import { randomUUID } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { Db } from "@/db"
import { drawingFiles, drawings } from "@/db/schema"
import { assertFolderTarget } from "@/features/folders/ownership"
import { lockFolderTree } from "@/features/folders/tree-lock"
import { accessibleTo } from "@/features/spaces/access"
import { MAX_NAME_LENGTH } from "./list-columns"
import { sceneText } from "./search"

const COPY_SUFFIX = " (copy)"

/** "Plan" → "Plan (copy)", cut so it still fits the name limit. */
export function copyName(name: string): string {
  return name.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length) + COPY_SUFFIX
}

/**
 * Copies a drawing and its images next to it: same folder, same space. The
 * copy is the caller's own, new and unstarred, with no share link.
 * `liveElements`: the scene of the drawing's open Room, newer than the stored one.
 */
export async function copyDrawing(
  db: Db,
  userId: string,
  id: string,
  liveElements: readonly Record<string, unknown>[] | null,
): Promise<{ id: string; name: string }> {
  return db.transaction(async (tx) => {
    await lockFolderTree(tx, "place")
    const [source] = await tx
      .select({
        name: drawings.name,
        data: drawings.data,
        searchText: drawings.searchText,
        folderId: drawings.folderId,
        space: drawings.space,
      })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, userId),
          isNull(drawings.deletedAt),
        ),
      )
    if (!source) throw new Error("Drawing not found")
    if (source.folderId) await assertFolderTarget(tx, userId, source.folderId)

    const copyId = randomUUID()
    const now = new Date()
    const name = copyName(source.name)
    await tx.insert(drawings).values({
      id: copyId,
      name,
      ...(liveElements
        ? {
            data: withElements(source.data, liveElements),
            searchText: sceneText(liveElements),
          }
        : { data: source.data, searchText: source.searchText }),
      folderId: source.folderId,
      space: source.space,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    // In SQL, so image bytes never pass through the app
    await tx.insert(drawingFiles).select(
      tx
        .select({
          id: sql<string>`gen_random_uuid()::text`.as("id"),
          drawingId: sql<string>`${copyId}`.as("drawingId"),
          fileId: drawingFiles.fileId,
          mimeType: drawingFiles.mimeType,
          bytes: drawingFiles.bytes,
          createdAt: sql<Date>`now()`.as("createdAt"),
        })
        .from(drawingFiles)
        .where(eq(drawingFiles.drawingId, id)),
    )
    return { id: copyId, name }
  })
}

/** The stored scene with its elements swapped; keeps appState and the rest. */
function withElements(
  data: string,
  elements: readonly Record<string, unknown>[],
): string {
  let scene: unknown
  try {
    scene = JSON.parse(data)
  } catch {}
  const base =
    typeof scene === "object" && scene !== null && !Array.isArray(scene)
      ? scene
      : {}
  return JSON.stringify({ ...base, elements })
}
