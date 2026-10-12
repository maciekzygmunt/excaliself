import type { Drawing } from "@/features/drawings/queries"
import { findInScene } from "@/features/drawings/search"

/** Sort orders offered by the browse toolbar (spec §5.2). */
export type SortOrder = "last-edited" | "date-created" | "name"

export const DEFAULT_SORT: SortOrder = "last-edited"

/** Single source for the dropdown's rows and the trigger's label. */
export const SORT_LABELS: Record<SortOrder, string> = {
  "last-edited": "Last edited",
  "date-created": "Date created",
  name: "Name",
}

export const SORT_ORDERS = Object.keys(SORT_LABELS) as SortOrder[]

/** All drawings, drawings without a folder, or one folder's drawings. */
export type GalleryScope = "all" | "unfiled" | { folderId: string }

/** The folder a scope narrows to, or null for the all/unfiled scopes. */
export function scopedFolderId(scope: GalleryScope): string | null {
  return typeof scope === "object" ? scope.folderId : null
}

// The cache can hold Dates (fresh from the server fn) or ISO strings
// (rehydrated after SSR serialization) — normalize before comparing.
function timestamp(value: Date | string): number {
  return new Date(value).getTime()
}

const byName = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
})

type Comparator = (a: Drawing, b: Drawing) => number

function bySortOrder(sort: SortOrder): Comparator {
  switch (sort) {
    case "last-edited":
      return (a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt)
    case "date-created":
      return (a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)
    case "name":
      return (a, b) => byName.compare(a.name, b.name)
  }
}

function nameMatches(drawing: Drawing, needle: string) {
  return drawing.name.toLowerCase().includes(needle)
}

/** Grid order. While searching, title matches lead scene-text matches; each
 * group keeps the sort order. */
export function compareDrawings(sort: SortOrder, query = ""): Comparator {
  const order = bySortOrder(sort)
  const needle = query.trim().toLowerCase()
  if (needle === "") return order
  return (a, b) =>
    Number(nameMatches(b, needle)) - Number(nameMatches(a, needle)) ||
    order(a, b)
}

/** On-page grid filter: substring search over the name and the scene's text,
 * composed with a folder scope. */
export function filterDrawings(
  drawings: Drawing[],
  { query, scope }: { query: string; scope: GalleryScope },
): Drawing[] {
  const needle = query.trim().toLowerCase()
  const folderId = scopedFolderId(scope)
  return drawings.filter((drawing) => {
    if (scope === "unfiled" && drawing.folderId !== null) return false
    if (folderId !== null && drawing.folderId !== folderId) return false
    return (
      needle === "" ||
      nameMatches(drawing, needle) ||
      findInScene(drawing, needle) !== null
    )
  })
}
