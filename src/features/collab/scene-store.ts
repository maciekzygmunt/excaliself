// What a Room loads when it spins up, and what it writes back (canvas sharing
// spec §2.3, §2.5). Kept out of the websocket route — which imports the live
// db — so the parsing half is drivable by tests with a fake db, mirroring
// shares/store.ts.

import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings } from "@/db/schema"
import type { SceneElement } from "./protocol"

type Db = NodePgDatabase<typeof schema>

/** The stored scene plus the owner the live badge will need (spec §1.5). */
export type StoredScene = { elements: SceneElement[]; ownerId: string | null }

/**
 * Stored elements are read with the same tolerance `restore()` gives them
 * client-side — a missing `version`/`versionNonce` is defaulted, not grounds
 * for dropping the element. The wire parser is strict because a peer is
 * untrusted; this data is ours, and discarding it would be losing a drawing.
 */
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

/**
 * `drawings.data` is whatever `serializeAsJSON` wrote — the Room only ever
 * wants its `elements`. Unreadable JSON yields an empty scene rather than
 * throwing: a corrupt drawing already renders as blank for its owner, and a
 * Room that refuses to open would take the share link down with it.
 */
export function parseStoredScene(data: string | null | undefined) {
  if (!data) return []
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== "object" || parsed === null) return []
    return toRoomElements((parsed as { elements?: unknown }).elements)
  } catch {
    return []
  }
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
    elements: parseStoredScene(drawing?.data),
    ownerId: drawing?.ownerId ?? null,
  }
}

/**
 * A flush is elements-only (spec §2.3): everything else the stored JSON
 * carries — `appState` above all, but also the `type`/`version`/`source`
 * envelope `serializeAsJSON` writes — is kept exactly as the last solo save
 * left it. Scene-level tweaks made mid-session neither sync nor persist,
 * which is what excalidraw.com does too.
 *
 * Unreadable JSON is replaced rather than preserved: the Room opened that
 * drawing as an empty canvas (`parseStoredScene`), so its elements are the
 * only real content left, and keeping the broken envelope would only keep the
 * drawing broken.
 */
export function mergeSceneElements(
  data: string | null | undefined,
  elements: SceneElement[],
): string {
  let stored: Record<string, unknown> = {}
  if (data) {
    try {
      const parsed: unknown = JSON.parse(data)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      )
        stored = parsed as Record<string, unknown>
    } catch {
      // Falls through to the bare envelope below.
    }
  }
  return JSON.stringify({ ...stored, elements })
}

/**
 * Write a Room's authoritative scene back to its drawing (spec §2.3). Bumps
 * `updatedAt` because a collaborative edit is an edit — the drawing has to
 * surface as Recent for its owner like any other.
 *
 * Deliberately not guarded on `deletedAt`: trashing mid-session ends with a
 * final flush precisely so guest work up to that moment survives and comes
 * back with the drawing on restore (spec §5.1). A hard delete leaves no row,
 * and the update simply matches nothing.
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
