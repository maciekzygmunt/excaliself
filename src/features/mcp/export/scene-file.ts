// A drawing as an `.excalidraw` file, in the format Excalidraw's "Save to
// file" writes (its serializeAsJSON(…, "local")), built without Excalidraw so
// it runs on the server.

import type { SceneFile } from "./scene-data"

/** Larger files are refused: an MCP result that big helps no client. */
export const MAX_SCENE_BYTES = 10 * 1024 * 1024

// The appState keys Excalidraw keeps in an exported file.
const EXPORTED_APP_STATE = new Set([
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "viewBackgroundColor",
  "lockedMultiSelections",
])

export function toExcalidrawFile(scene: {
  elements: readonly Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Map<string, SceneFile>
  /** The instance's origin, as a browser export writes it. */
  source: string
}): string {
  // As the app's own export: deleted elements stay out of the file.
  const elements = scene.elements.filter((element) => !element.isDeleted)
  const appState = Object.fromEntries(
    Object.entries(scene.appState).filter(
      ([key, value]) => EXPORTED_APP_STATE.has(key) && value !== undefined,
    ),
  )
  const files = Object.fromEntries(
    elements.flatMap((element) => {
      const file =
        typeof element.fileId === "string"
          ? scene.files.get(element.fileId)
          : undefined
      return file ? [[file.id, file]] : []
    }),
  )
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: scene.source,
      elements,
      appState,
      files,
    },
    null,
    2,
  )
}
