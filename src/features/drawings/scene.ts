import { hashString, restore, serializeAsJSON } from "@excalidraw/excalidraw"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { drawingShareQueryOptions } from "@/features/shares/queries"
import { drawingQueryOptions, drawingsQueryOptions } from "./queries"
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

/** Exactly what gets sent to the server and stored. */
export type ScenePayload = {
  data: string
  files: PersistedFile[]
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

export function buildScenePayload(scene: SceneData): ScenePayload {
  return {
    data: serializeAsJSON(
      scene.elements,
      scene.appState,
      scene.files ?? {},
      "database",
    ),
    files: toPersistedFiles(scene.elements, scene.files ?? {}),
  }
}

/**
 * Fingerprint of the persisted payload itself, so dedup compares exactly what
 * would be stored and can't drift from Excalidraw's persistence rules.
 */
export function getScenePayloadSignature(payload: ScenePayload) {
  const filesSignature = payload.files
    .map(
      (file) => `${file.fileId}:${file.mimeType}:${hashString(file.dataUrl)}`,
    )
    .join(",")
  return `${hashString(payload.data)}|${filesSignature}`
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

function parseSceneData(raw: string | undefined | null): {
  parsed: ExcalidrawInitialDataState | null
  isCorrupt: boolean
} {
  if (!raw) return { parsed: null, isCorrupt: false }
  try {
    return {
      parsed: JSON.parse(raw) as ExcalidrawInitialDataState,
      isCorrupt: false,
    }
  } catch {
    return { parsed: null, isCorrupt: true }
  }
}

export function buildInitialSceneData(
  drawing: { data: string; files?: PersistedFile[] | null } | null | undefined,
): { initialData: ExcalidrawInitialDataState; isDataCorrupt: boolean } {
  const files = toBinaryFiles(drawing?.files)
  const { parsed, isCorrupt } = parseSceneData(drawing?.data)
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
  return { initialData: { ...restored, files }, isDataCorrupt: isCorrupt }
}

export function useDrawingScene(id: string) {
  const { data: drawing } = useQuery(drawingQueryOptions(id))
  const scene = useMemo(
    () => (drawing ? buildInitialSceneData(drawing) : null),
    [drawing],
  )
  return {
    drawing,
    initialData: scene?.initialData ?? null,
    isDataCorrupt: scene?.isDataCorrupt ?? false,
  }
}

export function useSaveScenePayload(id: string) {
  const queryClient = useQueryClient()
  return useCallback(
    async (payload: ScenePayload) => {
      const result = await saveDrawingScene({
        data: { id, data: payload.data, files: payload.files },
      })
      // The drawing was shared — from another tab, or from this one before
      // its share query caught up — so the room owns its data now and the
      // server refused this write (spec §5.5). Not an error: refetch the
      // share, which is what flips this canvas into collab mode. Nothing is
      // lost, because joining the room reconciles the local scene into it.
      if (result?.status === "shared") {
        await queryClient.invalidateQueries({
          queryKey: drawingShareQueryOptions(id).queryKey,
        })
        return "skipped"
      }
      // Mirror the committed payload into the caches instead of invalidating:
      // refetching the detail query would re-download every base64 blob the
      // client just uploaded.
      const updatedAt = new Date()
      queryClient.setQueryData(drawingQueryOptions(id).queryKey, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          data: payload.data,
          updatedAt,
          files: payload.files.map((file) => {
            const existing = prev.files.find((f) => f.fileId === file.fileId)
            if (existing) return existing
            // Cache-only placeholder row; the client never reads `id`.
            return {
              id: file.fileId,
              drawingId: id,
              fileId: file.fileId,
              mimeType: file.mimeType,
              dataUrl: file.dataUrl,
              createdAt: updatedAt,
            }
          }),
        }
      })
      queryClient.setQueryData(drawingsQueryOptions().queryKey, (drawings) =>
        drawings?.map((drawing) =>
          drawing.id === id
            ? { ...drawing, data: payload.data, updatedAt }
            : drawing,
        ),
      )
      return "saved"
    },
    [id, queryClient],
  )
}
