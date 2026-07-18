import {
  hashElementsVersion,
  hashString,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { drawingQueryOptions } from "./queries"
import { saveDrawingScene } from "./server"

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

function toPersistedFiles(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): PersistedFile[] {
  // Excalidraw keeps file bytes in `files` even after the referencing image
  // element is deleted (for undo). Persist only files still referenced by a
  // live image element so removals on the canvas actually drop the row.
  const referenced = new Set<string>()
  for (const element of elements) {
    if (element.type === "image" && !element.isDeleted && element.fileId) {
      referenced.add(element.fileId)
    }
  }
  return Object.entries(files ?? {})
    .filter(([fileId]) => referenced.has(fileId))
    .map(([fileId, file]) => ({
      fileId,
      mimeType: file.mimeType || "image/png",
      dataUrl: file.dataURL || "",
    }))
}

function toBinaryFiles(
  persistedFiles: PersistedFile[] | null | undefined,
): BinaryFiles {
  const files: BinaryFiles = {}
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

function parseSceneData(raw: string | undefined | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ExcalidrawInitialDataState
  } catch {
    return null
  }
}

function buildInitialSceneData(
  drawing: { data: string; files?: PersistedFile[] | null } | null | undefined,
): ExcalidrawInitialDataState {
  const files = toBinaryFiles(drawing?.files)
  const parsed = parseSceneData(drawing?.data)
  const restored = restore(
    parsed
      ? { elements: parsed.elements, appState: parsed.appState, files }
      : null,
    null,
    null,
  )
  // JSON persistence flattens collaborators to a plain object; Excalidraw
  // requires a Map.
  restored.appState.collaborators = new Map()
  return { ...restored, files }
}

export function getSceneSignature(scene: SceneData) {
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

export function useDrawingScene(id: string) {
  const { data: drawing } = useQuery(drawingQueryOptions(id))
  const initialData = useMemo(
    () => (drawing ? buildInitialSceneData(drawing) : null),
    [drawing],
  )
  return { drawing, initialData }
}

export function useSaveScene(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scene: SceneData) =>
      saveDrawingScene({
        data: {
          id,
          data: serializeAsJSON(
            scene.elements,
            scene.appState,
            scene.files ?? {},
            "database",
          ),
          files: toPersistedFiles(scene.elements, scene.files ?? {}),
        },
      }),
    onSettled: () => queryClient.invalidateQueries(drawingQueryOptions(id)),
  })
}
