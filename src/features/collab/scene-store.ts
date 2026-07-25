// What a Room loads when it spins up (canvas sharing spec §2.5). Kept out of
// the websocket route — which imports the live db — so the parsing half is
// drivable by tests with a fake db, mirroring shares/store.ts.

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
