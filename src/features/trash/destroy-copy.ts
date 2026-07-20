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
  if (drawingCount > 0)
    parts.push(`${drawingCount} ${drawingCount === 1 ? "drawing" : "drawings"}`)
  if (folderCount > 0)
    parts.push(`${folderCount} ${folderCount === 1 ? "folder" : "folders"}`)
  return parts.length > 0 ? parts.join(" and ") : null
}
