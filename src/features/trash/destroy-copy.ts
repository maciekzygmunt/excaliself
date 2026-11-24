import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

/**
 * Count phrase for tier-2 count-aware danger dialogs (spec §4.5):
 * "8 drawings", "1 folder", "3 drawings and 2 folders" — null when there is
 * nothing to count, so callers can drop the clause entirely.
 */
export function describeContents(
  drawingCount: number,
  folderCount: number,
): string | null {
  const parts: string[] = []
  if (drawingCount > 0) parts.push(m.count_drawings({ count: drawingCount }))
  if (folderCount > 0) parts.push(m.count_folders({ count: folderCount }))
  if (parts.length === 0) return null
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(parts)
}
