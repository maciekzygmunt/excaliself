import { restore } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"

export type SceneData = {
  elements: readonly ExcalidrawElement[]
  appState: AppState
  files: BinaryFiles
}

export type PersistedFile = {
  fileId: string
  mimeType: string
  dataUrl: string
}

export const toPersistedFiles = (files: BinaryFiles) =>
  Object.entries(files || {}).map(([fileId, file]) => ({
    fileId,
    mimeType: file.mimeType || "image/png",
    dataUrl: file.dataURL || "",
  }))

export const restoreScene = (
  drawing: { data: string; files?: PersistedFile[] | null } | null | undefined,
): ExcalidrawInitialDataState => {
  if (!drawing) return restore(null, null, null)
  try {
    const parsed = JSON.parse(drawing.data)
    const files = {} as BinaryFiles
    drawing.files?.forEach((file) => {
      files[file.fileId] = {
        id: file.fileId,
        mimeType: file.mimeType,
        dataURL: file.dataUrl,
      } as BinaryFiles[string]
    })
    const restored = restore(
      {
        elements: parsed.elements,
        appState: parsed.appState,
        files,
      },
      null,
      null,
    )
    restored.appState.collaborators = new Map()
    return restored
  } catch {
    return restore(null, null, null)
  }
}
