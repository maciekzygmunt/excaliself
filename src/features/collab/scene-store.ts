// What a Room loads on spin-up and writes back.

import { and, eq, lt, notInArray } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles, drawings } from "@/db/schema"
import { referencedFileIds } from "@/features/drawings/scene-write"
import { sceneText } from "@/features/drawings/search"
import type { SceneElement } from "./protocol"
import { DELETED_ELEMENT_TIMEOUT_MS } from "./scene-sync"

type Db = NodePgDatabase<typeof schema>

/** The stored scene plus the owner the live badge needs. */
export type StoredScene = {
  elements: SceneElement[]
  ownerId: string | null
  /** False when the stored JSON could not be read. */
  readable: boolean
}

/** Lenient like `restore()`: our own data, so defaults beat dropping elements. */
export function toRoomElements(value: unknown): SceneElement[] {
  if (!Array.isArray(value)) return []
  const elements: SceneElement[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue
    const element = entry as Record<string, unknown>
    if (typeof element.id !== "string" || !element.id) continue
    elements.push({
      ...element,
      id: element.id,
      version: typeof element.version === "number" ? element.version : 1,
      versionNonce:
        typeof element.versionNonce === "number" ? element.versionNonce : 0,
    })
  }
  return elements
}

/** Null when unreadable; a blank drawing is `{}`. */
function parseStoredObject(
  data: string | null | undefined,
): Record<string, unknown> | null {
  if (!data) return {}
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Unreadable JSON comes back empty with `readable: false`, so no Room opens
 * on it and that emptiness never overwrites the file.
 */
export function parseStoredScene(data: string | null | undefined): {
  elements: SceneElement[]
  readable: boolean
} {
  const stored = parseStoredObject(data)
  if (!stored) return { elements: [], readable: false }
  return { elements: toRoomElements(stored.elements), readable: true }
}

export async function loadRoomScene(
  db: Db,
  drawingId: string,
): Promise<StoredScene> {
  const [drawing] = await db
    .select({ data: drawings.data, ownerId: drawings.ownerId })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
  return {
    ...parseStoredScene(drawing?.data),
    ownerId: drawing?.ownerId ?? null,
  }
}

/** Replaces only `elements`; `appState` and the envelope stay as last saved. */
export function mergeSceneElements(
  data: string | null | undefined,
  elements: SceneElement[],
): string {
  return JSON.stringify({ ...(parseStoredObject(data) ?? {}), elements })
}

/** An upload can land before its image's scene update, so new rows are kept this long. */
export const FILE_GRACE_MS = 60 * 60 * 1000

/**
 * Writes a Room's scene, bumps `updatedAt` and drops images nothing uses. Not
 * guarded on `deletedAt`, so a trash mid-session keeps guest work for a restore.
 */
export async function saveRoomScene(
  db: Db,
  drawingId: string,
  elements: SceneElement[],
): Promise<void> {
  const now = Date.now()
  await db.transaction(async (tx) => {
    const [drawing] = await tx
      .select({ data: drawings.data })
      .from(drawings)
      .where(eq(drawings.id, drawingId))
    if (!drawing) return
    await tx
      .update(drawings)
      .set({
        data: mergeSceneElements(drawing.data, elements),
        searchText: sceneText(elements),
        updatedAt: new Date(now),
      })
      .where(eq(drawings.id, drawingId))

    // Undo brings a deleted image back as "saved" and nothing re-uploads it,
    // so recent tombstones keep their bytes.
    const used = referencedFileIds(elements, now - DELETED_ELEMENT_TIMEOUT_MS)
    await tx
      .delete(drawingFiles)
      .where(
        and(
          eq(drawingFiles.drawingId, drawingId),
          lt(drawingFiles.createdAt, new Date(now - FILE_GRACE_MS)),
          notInArray(drawingFiles.fileId, [...used]),
        ),
      )
  })
}
