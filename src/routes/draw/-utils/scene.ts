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
  createdAt?: Date | string | null
}

export const toPersistedFiles = (files: BinaryFiles) =>
  Object.entries(files || {}).map(([fileId, file]) => ({
    fileId,
    mimeType: file.mimeType || "image/png",
    dataUrl: file.dataURL || "",
  }))

export const toBinaryFiles = (
  persistedFiles: PersistedFile[] | null | undefined,
): BinaryFiles => {
  const files = {} as BinaryFiles

  for (const file of persistedFiles ?? []) {
    const createdMs = file.createdAt ? new Date(file.createdAt).getTime() : 0
    files[file.fileId] = {
      id: file.fileId,
      mimeType: file.mimeType,
      dataURL: file.dataUrl,
      created: Number.isFinite(createdMs) ? createdMs : 0,
    } as BinaryFiles[string]
  }

  return files
}

export const buildInitialSceneData = (
  drawing: { data: string; files?: PersistedFile[] | null } | null | undefined,
): ExcalidrawInitialDataState => {
  const files = toBinaryFiles(drawing?.files)

  const restoreAndNormalize = (scene: ExcalidrawInitialDataState | null) => {
    const restored = restore(scene, null, null)

    // Excalidraw expects collaborators to be a Map, but JSON persistence turns it into an object.
    restored.appState.collaborators = new Map()

    return {
      ...restored,
      files,
    }
  }

  try {
    const parsed = drawing?.data
      ? (JSON.parse(drawing.data) as ExcalidrawInitialDataState)
      : null
    return restoreAndNormalize(
      parsed
        ? {
            elements: parsed.elements,
            appState: parsed.appState,
            files,
          }
        : null,
    )
  } catch {
    return restoreAndNormalize(null)
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
