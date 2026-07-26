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

import { exceedsFrameCap, MAX_FRAME_BYTES, utf8ByteLength } from "./frame-cap"
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

/** Room enough for `{"type":"SCENE_UPDATE","payload":{"elements":[]}}`, and then some. */
const FRAME_ENVELOPE_BYTES = 128

/**
 * Cut a selection into frames the server will accept (spec §5.4). The cap is
 * enforced there by closing the socket with 1009, and a client that healed by
 * reconnecting and re-sending the same oversized frame would close it again —
 * a loop the drawing never escapes. So the one side that can avoid tripping
 * it does: a big enough scene goes out as several frames instead of one.
 *
 * Whole-scene syncs are what get near the cap at all; ordinary deltas are a
 * handful of elements and take the fast path without measuring anything.
 */
export function splitSceneFrames(
  elements: readonly SceneElement[],
  maxBytes: number = MAX_FRAME_BYTES,
): SceneElement[][] {
  if (elements.length === 0) return []
  const budget = maxBytes - FRAME_ENVELOPE_BYTES

  // The whole selection in one frame, which is every ordinary delta — and
  // decided by the same cheap bounds the server's cap uses, so neither end
  // can drift into a different idea of how big "too big" is.
  const serialized = JSON.stringify(elements)
  if (!exceedsFrameCap(serialized, budget)) return [[...elements]]

  const frames: SceneElement[][] = []
  let frame: SceneElement[] = []
  let frameBytes = 0
  for (const element of elements) {
    const bytes = utf8ByteLength(JSON.stringify(element)) + 1 // the comma
    // A single element over the cap cannot be split, and sending it would
    // close the socket on arrival — which the reconnect would then repeat
    // forever. Dropping it costs that element's sync; keeping it would cost
    // the session. Loud, because nothing downstream will ever notice: peers
    // simply never see the shape, and its owner sees no error.
    if (bytes > budget) {
      console.warn(
        `[collab] element ${element.id} is ${bytes} bytes — too large for one frame, not synced`,
      )
      continue
    }
    if (frame.length > 0 && frameBytes + bytes > budget) {
      frames.push(frame)
      frame = []
      frameBytes = 0
    }
    frame.push(element)
    frameBytes += bytes
  }
  if (frame.length > 0) frames.push(frame)
  return frames
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
