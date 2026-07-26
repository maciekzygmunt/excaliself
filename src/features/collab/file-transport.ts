/**
 * The client's calls to the room-scoped image endpoint (spec §2.4).
 *
 * There is no error channel back to the canvas, so an upload's answer is
 * narrowed to the only distinction the canvas can act on: whether the server
 * ruled on this image, or never got to.
 */

import type { BinaryFileData } from "@excalidraw/excalidraw/types"
import { parseFilePayload, type RoomFileUpload } from "./room-files"
import { roomFileUrl } from "./room-url"

/**
 * The only answers that are about the *image*: too big, too often, or not an
 * image at all. Everything else a failed request can mean is about the
 * request — a 401 once a link has been stopped or regenerated, a 5xx, a
 * dropped connection — and none of those are grounds for telling the whole
 * room that someone's picture is broken.
 */
const IMAGE_VERDICTS = new Set([400, 413, 429])

export type UploadOutcome =
  | "stored"
  /**
   * The server looked at this image and said no — too large (413), too
   * frequent (429), or malformed (400). A verdict: retrying changes nothing,
   * so the image earns excalidraw's errored placeholder (spec §5.4).
   */
  | "refused"
  /**
   * The request got no answer, or an answer about itself rather than about
   * the image — offline, a dropped connection, a 5xx, a 401 from a link that
   * has just been stopped. Says nothing about the picture, so it must not
   * condemn it.
   */
  | "failed"

export async function uploadRoomFile(
  token: string,
  file: RoomFileUpload,
): Promise<UploadOutcome> {
  try {
    const response = await fetch(roomFileUrl(token, file.fileId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: file.dataUrl }),
    })
    if (response.ok) return "stored"
    return IMAGE_VERDICTS.has(response.status) ? "refused" : "failed"
  } catch {
    return "failed"
  }
}

/** One blob, in the shape `excalidrawAPI.addFiles()` takes. */
export async function fetchRoomFile(
  token: string,
  fileId: string,
): Promise<BinaryFileData | null> {
  try {
    const response = await fetch(roomFileUrl(token, fileId))
    if (!response.ok) return null
    const payload = parseFilePayload(await response.json())
    if (!payload) return null
    // The casts cross the same gap the scene loader's do: excalidraw brands
    // `FileId` and `DataURL`, and a value off the network carries no proof of
    // either. The guard above is what establishes it.
    return {
      id: payload.fileId as BinaryFileData["id"],
      mimeType: payload.mimeType as BinaryFileData["mimeType"],
      dataURL: payload.dataUrl as BinaryFileData["dataURL"],
      created: payload.created,
    }
  } catch {
    return null
  }
}
