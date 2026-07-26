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
 * Where an image's bytes have got to, in upstream's own vocabulary: not
 * stored yet, stored, or refused by the store (spec §5.4). CONTEXT.md calls
 * these the three states of a Scene image.
 */
export type ImageStatus = "pending" | "saved" | "error"

/**
 * An element's image identity, or null when it isn't a live image. Read
 * defensively: a remote element is untyped JSON, and a local one is only
 * typed until it crosses `SceneElement`.
 */
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

/** The deduped file ids of the scene's live images at `status`, minus `skip`. */
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
 * The blobs this tab owes the room: bytes it holds for an image that is still
 * `pending`, minus every id it must not offer.
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
  skip: ReadonlySet<string>,
): RoomFileUpload[] {
  return imageFileIds(elements, "pending", skip).flatMap((fileId) => {
    const dataUrl: string | undefined = files[fileId]?.dataURL
    // No bytes yet: excalidraw creates the element before the file lands in
    // the scene. The next `onChange` carries both.
    return dataUrl ? [{ fileId, dataUrl }] : []
  })
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
  return imageFileIds(elements, "saved", known)
}
