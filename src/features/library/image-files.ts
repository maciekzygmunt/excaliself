import type { BinaryFileData, LibraryItem } from "@excalidraw/excalidraw/types"
import { parseFileUpload } from "@/features/collab/room-files"

export class InvalidLibraryImage extends Error {}

/**
 * The files of an item's live images, from the `files` map an imported
 * library keeps inside each item. Throws if one is missing or malformed.
 */
export function libraryImageFiles(item: LibraryItem): BinaryFileData[] {
  // Persisted JSON: each entry used below is checked field by field.
  const files =
    (item as { files?: Record<string, BinaryFileData> | null }).files ?? {}
  const found = new Map<string, BinaryFileData>()
  for (const element of item.elements) {
    if (element.type !== "image" || element.isDeleted) continue
    const fileId = element.fileId ?? ""
    const entry = Object.hasOwn(files, fileId) ? files[fileId] : undefined
    const upload = parseFileUpload(fileId, { dataUrl: entry?.dataURL })
    if (
      upload.status !== "ok" ||
      entry?.id !== fileId ||
      entry.mimeType !== upload.file.mimeType ||
      !Number.isFinite(entry.created)
    )
      throw new InvalidLibraryImage(
        `Library item ${item.id} has a missing or invalid image file for element ${element.id}.`,
      )
    const { id, mimeType, dataURL, created } = entry
    found.set(fileId, { id, mimeType, dataURL, created })
  }
  return [...found.values()]
}
