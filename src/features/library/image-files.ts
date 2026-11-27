import type { LibraryItem } from "@excalidraw/excalidraw/types"
import {
  parseFileUpload,
  type RoomFilePayload,
} from "@/features/collab/room-files"

export class InvalidLibraryImage extends Error {}

/** Item-local files from an imported library. Only live image references count. */
export function libraryImageFiles(item: LibraryItem): RoomFilePayload[] {
  const { files } = item as LibraryItem & { files?: unknown }
  const entries =
    files && typeof files === "object" && !Array.isArray(files)
      ? (files as Record<string, unknown>)
      : null
  const found = new Map<string, RoomFilePayload>()
  for (const element of item.elements) {
    if (element.type !== "image" || element.isDeleted) continue
    const fileId = typeof element.fileId === "string" ? element.fileId : ""
    if (found.has(fileId)) continue
    const entry =
      entries && Object.hasOwn(entries, fileId)
        ? (entries[fileId] as {
            id?: unknown
            mimeType?: unknown
            dataURL?: unknown
            created?: unknown
          } | null)
        : null
    const upload = parseFileUpload(fileId, { dataUrl: entry?.dataURL })
    if (
      upload.status !== "ok" ||
      !entry ||
      entry.id !== fileId ||
      entry.mimeType !== upload.file.mimeType ||
      typeof entry.created !== "number" ||
      !Number.isFinite(entry.created)
    )
      throw new InvalidLibraryImage(
        `Library item ${item.id} has a missing or invalid image file for element ${element.id}.`,
      )
    found.set(upload.file.fileId, { ...upload.file, created: entry.created })
  }
  return [...found.values()]
}
