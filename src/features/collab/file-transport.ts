/**
 * The client's calls to the room-scoped image endpoint (spec §2.4).
 *
 * Both directions collapse every failure to one value on purpose. An upload
 * that was refused for being too large (413), for being too frequent (429),
 * or because the network dropped it all mean the same thing to the canvas:
 * this image will not reach the room, so it gets excalidraw's errored-image
 * placeholder (spec §5.4). There is no error channel to say more on.
 */

import type { BinaryFileData } from "@excalidraw/excalidraw/types"
import { parseFilePayload, type RoomFileUpload } from "./room-files"
import { roomFileUrl } from "./room-url"

export type UploadOutcome = "stored" | "rejected"

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
    return response.ok ? "stored" : "rejected"
  } catch {
    return "rejected"
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
