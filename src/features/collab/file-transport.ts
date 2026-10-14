/** Client calls to the room image endpoint. */

import type { BinaryFileData } from "@excalidraw/excalidraw/types"
import { parseFilePayload, type RoomFileUpload } from "./room-files"
import { roomFileUrl } from "./room-url"

// Statuses about the image itself; a 401/5xx/network error must not mark it broken.
const IMAGE_VERDICTS = new Set([400, 413, 429])

export type UploadOutcome =
  | "stored"
  /** 400/413/429: final, the image shows as errored. */
  | "refused"
  /** 409: the drawing's image cap is full. Final, like `refused`. */
  | "full"
  /** No verdict on the image (network, 5xx, 401); retryable. */
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
    if (response.status === 409) return "full"
    return IMAGE_VERDICTS.has(response.status) ? "refused" : "failed"
  } catch {
    return "failed"
  }
}

export async function fetchRoomFile(
  token: string,
  fileId: string,
): Promise<BinaryFileData | null> {
  try {
    const response = await fetch(roomFileUrl(token, fileId))
    if (!response.ok) return null
    const payload = parseFilePayload(await response.json())
    if (!payload) return null
    // Casts to excalidraw's branded types; `parseFilePayload` validated them.
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
