// How a member's tab applies a proposed edit to its own canvas. From there
// the canvas's usual writer (the Room, or autosave) carries it.

type Versioned = { readonly id: string; readonly version: number }

/** True when an element the edit changes is gone or has moved on since it was planned. */
export function isStale(
  current: readonly Versioned[],
  base: Record<string, number>,
): boolean {
  const versions = new Map(current.map(({ id, version }) => [id, version]))
  return Object.entries(base).some(
    ([id, version]) => versions.get(id) !== version,
  )
}

/** The scene with the edit in it: changed elements replaced in place, new ones on top. */
export function withEdit<T extends Versioned>(
  current: readonly T[],
  edited: readonly T[],
): T[] {
  const byId = new Map(edited.map((element) => [element.id, element]))
  const known = new Set(current.map(({ id }) => id))
  return [
    ...current.map((element) => byId.get(element.id) ?? element),
    ...edited.filter(({ id }) => !known.has(id)),
  ]
}
