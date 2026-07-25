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

export type UploadOutcome =
  | "stored"
  /**
   * The server looked at this image and said no — too large (413), too
   * frequent (429), or malformed. A verdict: retrying changes nothing, so the
   * image earns excalidraw's errored placeholder (spec §5.4).
   */
  | "refused"
  /**
   * The request never got an answer — offline, a dropped connection, a 5xx.
   * Says nothing about the image, so it must not condemn it.
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
    // 4xx is the server ruling on the image; 5xx is the server having a bad
    // day, which the next attempt may not.
    return response.status < 500 ? "refused" : "failed"
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
