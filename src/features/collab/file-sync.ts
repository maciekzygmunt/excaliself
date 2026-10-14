/** Which image blobs a tab owes the room and which it lacks, from the scene alone. */

import type { BinaryFiles } from "@excalidraw/excalidraw/types"
import type { SceneElement } from "./protocol"
import type { RoomFileUpload } from "./room-files"

/** Upstream's image states: not stored yet, stored, or refused. */
export type ImageStatus = "pending" | "saved" | "error"

// Defensive: remote elements are untyped JSON.
function imageOf(
  element: SceneElement,
): { fileId: string; status: ImageStatus } | null {
  if (element.type !== "image" || element.isDeleted) return null
  const { fileId, status } = element as { fileId?: unknown; status?: unknown }
  if (typeof fileId !== "string" || !fileId) return null
  return {
    fileId,
    // Upstream's own default: an image with no status is not stored yet.
    status:
      status === "saved" || status === "error" ? status : ("pending" as const),
  }
}

function imageFileIds(
  elements: readonly SceneElement[],
  status: ImageStatus,
  skip: ReadonlySet<string>,
): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    const image = imageOf(element)
    if (!image || image.status !== status) continue
    if (skip.has(image.fileId) || seen.has(image.fileId)) continue
    seen.add(image.fileId)
    found.push(image.fileId)
  }
  return found
}

/**
 * `pending` images this tab has bytes for, minus `skip`. `restore()` loads
 * stored images as `pending`, so `skip` stops every visitor re-uploading them.
 */
export function selectUploads(
  elements: readonly SceneElement[],
  files: BinaryFiles,
  skip: ReadonlySet<string>,
): RoomFileUpload[] {
  return imageFileIds(elements, "pending", skip).flatMap((fileId) => {
    const dataUrl: string | undefined = files[fileId]?.dataURL
    // The element can land before its file; the next `onChange` carries both.
    return dataUrl ? [{ fileId, dataUrl }] : []
  })
}

/** Only `saved` images: `pending` and `error` have no stored bytes to fetch. */
export function selectMissingFileIds(
  elements: readonly SceneElement[],
  known: ReadonlySet<string>,
): string[] {
  return imageFileIds(elements, "saved", known)
}
