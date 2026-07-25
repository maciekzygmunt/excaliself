/**
 * What a tab decides to put on the wire (canvas sharing spec §2.2), ported
 * from upstream's `Collab`/`Portal` pair.
 *
 * Two gates, both needed. The scene-version gate answers "has anything
 * changed at all?" — `onChange` fires on pans, selections and hovers, and the
 * summed element versions only move when an element actually did. The
 * per-element gate then answers "which ones?", so a stroke on one shape
 * doesn't re-send the other four hundred.
 *
 * Kept apart from `use-room.ts` because this is where the interesting
 * decisions live and none of them need React to be exercised.
 */

import type { SceneElement } from "./protocol"
import { getSceneVersion } from "./reconcile"

/** Upstream's `SYNC_FULL_SCENE_INTERVAL_MS` — the safety-net cadence. */
export const SYNC_FULL_SCENE_INTERVAL_MS = 20_000

/** Upstream's `DELETED_ELEMENT_TIMEOUT`. */
export const DELETED_ELEMENT_TIMEOUT_MS = 24 * 60 * 60 * 1000

/**
 * A tombstone stops travelling a day after it was made: by then every live
 * peer has applied the delete, and the database is the GC source of truth
 * (spec §2.5). Elements with no `updated` stamp keep syncing — dropping one
 * would be deciding a delete never happened.
 */
function isSyncableElement(element: SceneElement, now: number): boolean {
  if (!element.isDeleted) return true
  return typeof element.updated === "number"
    ? element.updated > now - DELETED_ELEMENT_TIMEOUT_MS
    : true
}

export function createSceneBroadcaster(now: () => number = () => Date.now()) {
  /** The version of each element as the room last saw it, from either side. */
  const roomElementVersions = new Map<string, number>()
  /** Everything below this has already been sent or received. */
  let lastSceneVersion = -1

  function select(elements: readonly SceneElement[], syncAll: boolean) {
    const at = now()
    const selected = elements.filter(
      (element) =>
        isSyncableElement(element, at) &&
        (syncAll ||
          (roomElementVersions.get(element.id) ?? -1) < element.version),
    )
    for (const element of selected) {
      roomElementVersions.set(element.id, element.version)
    }
    return selected
  }

  return {
    /**
     * The elements to broadcast after a local change, or null when the scene
     * hasn't moved since the last frame this tab sent or received — which is
     * what stops a remote update from being echoed straight back.
     */
    delta(elements: readonly SceneElement[]): SceneElement[] | null {
      const version = getSceneVersion(elements)
      if (version <= lastSceneVersion) return null
      lastSceneVersion = version
      return select(elements, false)
    },

    /**
     * What the Room has not seen, sent regardless of whether the scene has
     * moved — the catch-up a tab owes the Room once SCENE_INIT reveals which
     * elements it was holding that the Room never had.
     */
    catchUp(elements: readonly SceneElement[]): SceneElement[] {
      lastSceneVersion = Math.max(lastSceneVersion, getSceneVersion(elements))
      return select(elements, false)
    },

    /**
     * Everything worth syncing, whatever has already gone out — the 20 s
     * safety net. Repeating what the Room supposedly knows is the entire
     * point: it repairs a peer that missed a frame.
     */
    full(elements: readonly SceneElement[]): SceneElement[] {
      lastSceneVersion = Math.max(lastSceneVersion, getSceneVersion(elements))
      return select(elements, true)
    },

    /**
     * Record an incoming frame. `remote` is what the Room demonstrably has,
     * so it never needs sending back; `reconciled` is the scene about to be
     * applied.
     *
     * Must be called *before* `updateScene`, which re-triggers `onChange`
     * synchronously — otherwise the merge this tab just accepted goes back
     * out as if it were a local edit.
     */
    received(
      remote: readonly SceneElement[],
      reconciled: readonly SceneElement[],
    ) {
      for (const element of remote) {
        const known = roomElementVersions.get(element.id) ?? -1
        if (element.version > known)
          roomElementVersions.set(element.id, element.version)
      }
      lastSceneVersion = getSceneVersion(reconciled)
    },
  }
}
