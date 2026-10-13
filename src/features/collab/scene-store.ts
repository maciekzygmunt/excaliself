// What a Room loads on spin-up and writes back.

import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings } from "@/db/schema"
import type { SceneElement } from "./protocol"

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
 * Unreadable JSON opens as an empty scene, with `readable: false` so the Room
 * never writes that emptiness back over the file.
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

/**
 * Writes a Room's scene and bumps `updatedAt`. Not guarded on `deletedAt`, so
 * a trash mid-session keeps guest work for a restore.
 */
export async function saveRoomScene(
  db: Db,
  drawingId: string,
  elements: SceneElement[],
): Promise<void> {
  const [drawing] = await db
    .select({ data: drawings.data })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
  if (!drawing) return
  await db
    .update(drawings)
    .set({
      data: mergeSceneElements(drawing.data, elements),
      updatedAt: new Date(),
    })
    .where(eq(drawings.id, drawingId))
}
