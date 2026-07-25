/**
 * Excalidraw's element merge rule, ported for the server (canvas sharing
 * spec §2.3).
 *
 * `@excalidraw/excalidraw` exports `reconcileElements`, but only from a build
 * that reads `import.meta.env` and `window`, so a Room can't import it. This
 * is the same rule, kept deliberately literal against upstream
 * `data/reconcile.ts` so an upstream change reads as a diff. The client keeps
 * using the package's copy; the two agreeing is what makes concurrent edits
 * converge to the same winner on every side (spec §5.2).
 *
 * Left out of the port: upstream's fractional-index validation and repair.
 * Every client re-syncs indices when `updateScene` applies what it receives,
 * and the Room needs nothing from an index but a stable order.
 */

import type { SceneElement } from "./protocol"

/**
 * The slice of Excalidraw's appState the rule consults — an element the user
 * has their hands on right now is never yanked out from under them.
 *
 * A Room passes `{}`: nothing is being edited on the server, so only the
 * version rules apply there. It stays a parameter so the port can be tested
 * against the same cases as the client's copy.
 */
export type EditingState = {
  editingTextElement?: { id: string } | null
  resizingElement?: { id: string } | null
  newElement?: { id: string } | null
}

function shouldDiscardRemoteElement(
  localAppState: EditingState,
  local: SceneElement | undefined,
  remote: SceneElement,
): boolean {
  if (!local) return false
  return (
    // local element is being edited
    local.id === localAppState.editingTextElement?.id ||
    local.id === localAppState.resizingElement?.id ||
    local.id === localAppState.newElement?.id ||
    // local element is newer
    local.version > remote.version ||
    // resolve conflicting edits deterministically by taking the one with the
    // lowest versionNonce
    (local.version === remote.version &&
      local.versionNonce < remote.versionNonce)
  )
}

/**
 * Upstream's comparator, quirks included: a pair where either side has no
 * index sorts as "already in place" rather than being moved. Ties on the
 * index itself break by id, so peers holding the same elements agree on the
 * order without talking to each other.
 */
function orderByFractionalIndex(elements: SceneElement[]): SceneElement[] {
  return elements.sort((a, b) => {
    if (a.index != null && b.index != null) {
      if (a.index < b.index) return -1
      if (a.index > b.index) return 1
      return a.id < b.id ? -1 : 1
    }
    return 1
  })
}

/**
 * Merge `remoteElements` into `localElements`, per-element last-writer-wins.
 * Neither input is mutated; the returned array is a new one, ordered by
 * fractional index.
 */
export function reconcileElements(
  localElements: readonly SceneElement[],
  remoteElements: readonly SceneElement[],
  localAppState: EditingState,
): SceneElement[] {
  const localElementsMap = new Map(localElements.map((el) => [el.id, el]))
  const reconciledElements: SceneElement[] = []
  const added = new Set<string>()

  for (const remoteElement of remoteElements) {
    if (added.has(remoteElement.id)) continue
    const localElement = localElementsMap.get(remoteElement.id)
    const winner =
      localElement &&
      shouldDiscardRemoteElement(localAppState, localElement, remoteElement)
        ? localElement
        : remoteElement
    reconciledElements.push(winner)
    added.add(winner.id)
  }

  for (const localElement of localElements) {
    if (added.has(localElement.id)) continue
    reconciledElements.push(localElement)
    added.add(localElement.id)
  }

  return orderByFractionalIndex(reconciledElements)
}

/**
 * Upstream's cheap scene fingerprint: monotonic, because an element's version
 * only ever goes up. Used to decide whether anything is worth broadcasting.
 */
export function getSceneVersion(elements: readonly SceneElement[]): number {
  return elements.reduce((total, element) => total + element.version, 0)
}
