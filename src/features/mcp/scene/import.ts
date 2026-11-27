// import_scene's parser: a .excalidraw file's JSON, checked and cleaned on
// the server, since no Excalidraw restore() runs before it is stored. Field
// types are checked so the editor and our scene readers can open the
// result; ids and versions are trusted no more than restore() trusts them.

import { z } from "zod"
import { MAX_ELEMENT_DEPTH, nestedDeeperThan } from "@/features/collab/protocol"
import {
  MAX_DRAWING_IMAGE_BYTES,
  parseFileUpload,
} from "@/features/collab/room-files"
import {
  MAX_ROOM_ELEMENTS,
  MAX_ROOM_SCENE_BYTES,
} from "@/features/collab/room-session"
import { dataUrlToBytes } from "@/features/drawings/file-bytes"
import type { SceneContent } from "@/features/drawings/scene-import"
import { referencedFileIds } from "@/features/drawings/scene-write"
import { sceneElement } from "./element-input"
import { newId, withIndices } from "./elements"
import { ref, SceneInputError } from "./skeleton"

const num = z.number()

/** Only what Excalidraw's "Save to file" keeps; a bad value is dropped. */
const appState = z
  .object({
    viewBackgroundColor: z.string().max(32).optional().catch(undefined),
    gridSize: num.positive().optional().catch(undefined),
    gridStep: num.int().positive().optional().catch(undefined),
    gridModeEnabled: z.boolean().optional().catch(undefined),
  })
  .catch({})

const scene = z.object({
  type: z
    .literal("excalidraw", {
      error: 'Not a .excalidraw scene: "type" must be "excalidraw".',
    })
    .optional(),
  elements: z.array(sceneElement).max(MAX_ROOM_ELEMENTS),
  appState: appState.optional(),
  files: z.record(z.string(), z.unknown()).optional(),
})

/** Lists the first few problems, each with where it is in the scene. */
function describe(issues: z.core.$ZodIssue[]): string {
  const lines = issues.slice(0, 10).map((issue) => {
    const path = issue.path
      .map((key, i) =>
        typeof key === "number"
          ? `[${key}]`
          : i === 0
            ? key
            : `.${String(key)}`,
      )
      .join("")
    return `${path || "scene"}: ${issue.message}`
  })
  if (issues.length > 10) lines.push(`… and ${issues.length - 10} more.`)
  return lines.join("\n")
}

/** Below 2^31, like Excalidraw's own values, so +1 keeps counting. */
const isVersion = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= 1 &&
  (value as number) < 2 ** 31

export type ImportedScene = {
  content: SceneContent
  /** Images whose file the scene doesn't carry; they open as placeholders. */
  missingImages: number
}

/** A scene's JSON text, or the object a client parsed it into. */
function readJson(input: string | object): unknown {
  if (typeof input !== "string") return input
  try {
    return JSON.parse(input)
  } catch {
    throw new SceneInputError("The scene is not valid JSON.")
  }
}

/**
 * Parses a scene for a new drawing. Throws SceneInputError on anything the
 * editor could not open, naming each problem.
 */
export function parseImportedScene(input: string | object): ImportedScene {
  const parsed = scene.safeParse(readJson(input))
  if (!parsed.success) throw new SceneInputError(describe(parsed.error.issues))

  // The Room refuses deeper elements, so its later syncs would fail.
  const deep = parsed.data.elements.findIndex((element) =>
    nestedDeeperThan(element, MAX_ELEMENT_DEPTH),
  )
  if (deep >= 0)
    throw new SceneInputError(
      `elements[${deep}]: nested more than ${MAX_ELEMENT_DEPTH} levels deep.`,
    )

  // As restore(): keep valid ids and versions, replace bad or repeated ids.
  // A negative nonce is reset too, since the Room refuses it.
  // Deleted elements are dropped.
  const seen = new Set<string>()
  const elements = withIndices(
    parsed.data.elements
      .filter((element) => !element.isDeleted)
      .map((element) => {
        let id = ref.safeParse(element.id).data ?? newId()
        if (seen.has(id)) id = newId()
        seen.add(id)
        return {
          ...element,
          id,
          version: isVersion(element.version) ? element.version : 1,
          versionNonce: isVersion(element.versionNonce)
            ? element.versionNonce
            : 0,
        }
      }),
  )
  if (Buffer.byteLength(JSON.stringify(elements)) > MAX_ROOM_SCENE_BYTES)
    throw new SceneInputError(
      `The elements are over ${MAX_ROOM_SCENE_BYTES / 1024 / 1024} MB.`,
    )

  // Same rules as importing a file in the app: any supported image type,
  // within the drawing's image budget. Files no element uses are dropped.
  const files = parsed.data.files ?? {}
  const kept: Record<string, unknown> = {}
  const errors: string[] = []
  const megabytes = MAX_DRAWING_IMAGE_BYTES / 1024 / 1024
  let bytes = 0
  let missingImages = 0
  for (const fileId of referencedFileIds(elements)) {
    const entry = files[fileId]
    if (entry === undefined) {
      missingImages++
      continue
    }
    const dataUrl = (entry as { dataURL?: unknown } | null)?.dataURL
    const upload = parseFileUpload(fileId, { dataUrl }, MAX_DRAWING_IMAGE_BYTES)
    if (upload.status === "invalid")
      errors.push(
        `files["${fileId}"]: needs a "dataURL" with a PNG, JPEG, GIF, WebP, SVG, BMP, ICO, or AVIF image, and the file id must be 1–128 letters, digits, "-", or "_".`,
      )
    else if (upload.status === "too-large")
      errors.push(`files["${fileId}"]: the image is over ${megabytes} MB.`)
    else {
      bytes += dataUrlToBytes(upload.file.dataUrl).length
      kept[fileId] = entry
    }
  }
  if (errors.length > 0) throw new SceneInputError(errors.join("\n"))
  if (bytes > MAX_DRAWING_IMAGE_BYTES)
    throw new SceneInputError(
      `The images are over ${megabytes} MB in all, the most one drawing can hold.`,
    )

  return {
    content: {
      elements,
      appState: parsed.data.appState ?? {},
      files: kept,
      filesFailedToEmbed: [],
    },
    missingImages,
  }
}
