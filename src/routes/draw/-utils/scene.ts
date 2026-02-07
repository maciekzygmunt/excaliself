import {
  hashElementsVersion,
  hashString,
  restore,
} from "@excalidraw/excalidraw"
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

export const getSceneSignature = (scene: SceneData) => {
  const elementsSignature = hashElementsVersion(scene.elements)
  const appStateSignature = [
    scene.appState.gridModeEnabled ? "1" : "0",
    scene.appState.viewBackgroundColor ?? "",
    String(scene.appState.gridSize ?? ""),
    String(scene.appState.gridStep ?? ""),
  ].join("|")

  // Keep per-change signature cheap by hashing file metadata only.
  let filesSignature = 0
  for (const [fileId, file] of Object.entries(scene.files ?? {})) {
    filesSignature =
      (filesSignature +
        hashString(
          `${fileId}:${file.version ?? 0}:${file.mimeType}:${file.dataURL?.length ?? 0}`,
        )) >>>
      0
  }

  return `${elementsSignature}|${appStateSignature}|${filesSignature}`
}
