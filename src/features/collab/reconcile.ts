// Server port of Excalidraw's `reconcileElements` (upstream's build needs
// `window`). Keep it literal to upstream so clients and Room pick the same winner.

import type { SceneElement } from "./protocol"

/** Elements being edited locally always win. A Room passes `{}`. */
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

/** Upstream's comparator, quirks included. */
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

/** Per-element last-writer-wins merge into a new array. */
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

/** Upstream's scene fingerprint; monotonic, since versions only go up. */
export function getSceneVersion(elements: readonly SceneElement[]): number {
  return elements.reduce((total, element) => total + element.version, 0)
}
