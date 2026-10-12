import type { Drawing } from "./queries"

type StoredElement = {
  type: string
  isDeleted?: boolean
  text?: string
  originalText?: string
}

/**
 * The words in a stored scene: every live text element, which includes labels
 * bound to shapes and arrows. Whitespace is collapsed so wrapped lines read as
 * one line. Empty for an empty or unparseable scene.
 */
export function extractSceneText(data: string): string {
  let elements: StoredElement[]
  try {
    elements =
      (JSON.parse(data) as { elements?: StoredElement[] } | null)?.elements ??
      []
  } catch {
    return ""
  }
  return (
    elements
      .filter((element) => element.type === "text" && !element.isDeleted)
      // originalText is the unwrapped source; text has container wrapping
      .map((element) => element.originalText ?? element.text ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
  )
}

// Keyed by the cached row: React Query keeps unchanged rows referentially
// stable, so a scene is parsed once per save, not once per keystroke.
const sceneTextCache = new WeakMap<Pick<Drawing, "data">, string>()

function sceneText(drawing: Pick<Drawing, "data">): string {
  let text = sceneTextCache.get(drawing)
  if (text === undefined) {
    text = extractSceneText(drawing.data)
    sceneTextCache.set(drawing, text)
  }
  return text
}

// Short lead keeps the match in view next to a long title in the palette
const SNIPPET_LEAD = 12
const SNIPPET_LENGTH = 80

/**
 * A short excerpt around the first case-insensitive match of `query` in the
 * drawing's scene text, or null when the scene doesn't contain it. Callers
 * truncate the tail in CSS.
 */
export function findInScene(
  drawing: Pick<Drawing, "data">,
  query: string,
): string | null {
  const needle = query.trim().toLowerCase()
  if (needle === "") return null
  const text = sceneText(drawing)
  const at = text.toLowerCase().indexOf(needle)
  if (at === -1) return null
  // Lead in from a word start; no space before the lead means start at 0
  const start =
    at <= SNIPPET_LEAD ? 0 : text.lastIndexOf(" ", at - SNIPPET_LEAD) + 1
  return `${start > 0 ? "…" : ""}${text.slice(start, start + SNIPPET_LENGTH)}`
}
