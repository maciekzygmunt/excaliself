/**
 * What a tab decides to do about image bytes (canvas sharing spec §2.4) — the
 * blob half of the split `scene-sync.ts` makes for elements.
 *
 * The image element itself is nothing special: it syncs as a normal delta.
 * What is special is that its bytes are not in that delta, so each tab has to
 * work out two things from the scene alone — which blobs it owes the room,
 * and which it is missing. Both answers are pure functions of the elements,
 * which is why they live here rather than in the hook that acts on them.
 */

import type { BinaryFiles } from "@excalidraw/excalidraw/types"
import type { SceneElement } from "./protocol"
import type { RoomFileUpload } from "./room-files"

/**
 * An element's image identity, or null when it isn't a live image. Read
 * defensively: a remote element is untyped JSON, and a local one is only
 * typed until it crosses `SceneElement`.
 */
function imageOf(
  element: SceneElement,
): { fileId: string; status: string } | null {
  if (element.type !== "image" || element.isDeleted) return null
  const { fileId, status } = element as { fileId?: unknown; status?: unknown }
  if (typeof fileId !== "string" || !fileId) return null
  // Upstream's own default: an image with no status has not been stored yet.
  return { fileId, status: typeof status === "string" ? status : "pending" }
}

/**
 * The blobs this tab owes the room: bytes it holds for an image that is still
 * `pending`, minus every id already known to be stored.
 *
 * That subtraction is what keeps a room's images from being re-uploaded by
 * everyone who opens the link. Images saved before the session began arrive
 * from the page loader as `pending` — upstream's `restore()` never promotes
 * them — with their bytes already in the scene, so without the exclusion each
 * visitor would POST the whole drawing back and spend the upload budget doing
 * it.
 */
export function selectUploads(
  elements: readonly SceneElement[],
  files: BinaryFiles,
  stored: ReadonlySet<string>,
): RoomFileUpload[] {
  const uploads: RoomFileUpload[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    const image = imageOf(element)
    if (!image || image.status !== "pending") continue
    if (stored.has(image.fileId) || seen.has(image.fileId)) continue
    const dataUrl = files[image.fileId]?.dataURL
    // No bytes yet: excalidraw creates the element before the file lands in
    // the scene. The next `onChange` carries both.
    if (!dataUrl) continue
    seen.add(image.fileId)
    uploads.push({ fileId: image.fileId, dataUrl })
  }
  return uploads
}

/**
 * The ids this tab needs bytes for. Only `saved` images qualify: `pending`
 * means the uploader hasn't written the row yet and `error` means it never
 * will (spec §5.4), so fetching either is a guaranteed miss — and the errored
 * case is exactly the "peers never fetch that fileId" the cap promises.
 */
export function selectMissingFileIds(
  elements: readonly SceneElement[],
  known: ReadonlySet<string>,
): string[] {
  const missing: string[] = []
  const seen = new Set<string>()
  for (const element of elements) {
    const image = imageOf(element)
    if (!image || image.status !== "saved") continue
    if (known.has(image.fileId) || seen.has(image.fileId)) continue
    seen.add(image.fileId)
    missing.push(image.fileId)
  }
  return missing
}
