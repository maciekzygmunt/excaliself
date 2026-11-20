/**
 * File ids of live images in the scene, plus images deleted after
 * `keepDeletedSince` (epoch ms), so an undo still finds their bytes.
 */
export function referencedFileIds(
  elements: readonly Record<string, unknown>[],
  keepDeletedSince = Number.POSITIVE_INFINITY,
): Set<string> {
  return new Set(
    elements.flatMap((el) =>
      el.type === "image" &&
      typeof el.fileId === "string" &&
      (!el.isDeleted ||
        (typeof el.updated === "number" && el.updated > keepDeletedSince))
        ? [el.fileId]
        : [],
    ),
  )
}
