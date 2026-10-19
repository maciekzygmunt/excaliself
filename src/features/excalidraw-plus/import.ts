// Writes one Excalidraw+ scene as a drawing. Kept out of server.ts so tests
// can drive it with a real (PGlite) db.

import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type { Db } from "@/db"
import { drawingFiles, drawings, folders, type Space, stars } from "@/db/schema"
import {
  MAX_DRAWING_IMAGE_BYTES,
  parseFileUpload,
} from "@/features/collab/room-files"
import { dataUrlToBytes } from "@/features/drawings/file-bytes"
import { referencedFileIds } from "@/features/drawings/scene-write"
import { sceneText } from "@/features/drawings/search"
import { lockFolderTree, type Tx } from "@/features/folders/tree-lock"
import { accessibleTo } from "@/features/spaces/access"
import { type PlusSceneContent, PRIVATE_COLLECTION } from "./api"

/** One scene as the import lists it; the client sends it back to import. */
export type ImportScene = {
  id: string
  name: string
  created?: Date
  updated?: Date
  pinned: boolean
  collection: { id: string; name: string }
}

export type ImportResult =
  | { status: "imported"; space: Space; skippedImages: number }
  /** A drawing the member can see already came from this scene. */
  | { status: "exists" }

type PreparedScene = {
  data: string
  searchText: string
  files: { fileId: string; mimeType: string; bytes: Buffer }[]
  skippedImages: number
}

/**
 * The scene as excaliself stores it. Only images live elements use are kept,
 * up to the drawing's image budget; each image left without bytes is marked
 * `error`, so every canvas shows the placeholder instead of waiting for it.
 */
export function prepareScene(content: PlusSceneContent): PreparedScene {
  const failed = new Set(content.filesFailedToEmbed)
  let budget = MAX_DRAWING_IMAGE_BYTES
  const files: PreparedScene["files"] = []
  for (const fileId of referencedFileIds(content.elements)) {
    if (failed.has(fileId)) continue
    const entry = content.files[fileId] as { dataURL?: unknown } | undefined
    // The drawing's whole budget is the only cap: Excalidraw+ allows bigger
    // images than a live upload here, and a stored one loads at any size.
    const parsed = parseFileUpload(
      fileId,
      { dataUrl: entry?.dataURL },
      MAX_DRAWING_IMAGE_BYTES,
    )
    if (parsed.status !== "ok") continue
    const bytes = dataUrlToBytes(parsed.file.dataUrl)
    if (bytes.length > budget) continue
    budget -= bytes.length
    files.push({ fileId, mimeType: parsed.file.mimeType, bytes })
  }

  const stored = new Set(files.map((file) => file.fileId))
  const elements = content.elements.map((element) =>
    element.type === "image" &&
    typeof element.fileId === "string" &&
    !stored.has(element.fileId)
      ? { ...element, status: "error" }
      : element,
  )
  const live = referencedFileIds(content.elements)

  return {
    data: JSON.stringify({
      type: content.type ?? "excalidraw",
      version: content.version ?? 2,
      source: content.source ?? "https://plus.excalidraw.com",
      elements,
      appState: content.appState,
    }),
    searchText: sceneText(elements),
    files,
    skippedImages: [...live].filter((fileId) => !stored.has(fileId)).length,
  }
}

/**
 * Imports one scene into the folder made for its collection, creating that
 * folder on first use. The private collection lands in Private; every other
 * one in `sharedSpace`. Skips a scene the member can already see a copy of.
 */
export async function importScene(
  db: Db,
  userId: string,
  input: { scene: ImportScene; content: PlusSceneContent; sharedSpace: Space },
): Promise<ImportResult> {
  const { scene, sharedSpace } = input
  const prepared = prepareScene(input.content)
  const space =
    scene.collection.id === PRIVATE_COLLECTION ? "private" : sharedSpace

  return db.transaction(async (tx) => {
    await lockFolderTree(tx, "place")

    const [existing] = await tx
      .select({ id: drawings.id })
      .from(drawings)
      .where(
        and(
          eq(drawings.excalidrawPlusId, scene.id),
          accessibleTo(drawings, userId),
        ),
      )
      .limit(1)
    if (existing) return { status: "exists" as const }

    const folderId = await collectionFolder(tx, userId, space, scene.collection)
    const drawingId = randomUUID()
    const now = new Date()
    await tx.insert(drawings).values({
      id: drawingId,
      name: scene.name.trim() || "Untitled",
      data: prepared.data,
      searchText: prepared.searchText,
      folderId,
      excalidrawPlusId: scene.id,
      space,
      createdBy: userId,
      createdAt: scene.created ?? now,
      updatedAt: scene.updated ?? scene.created ?? now,
    })
    if (prepared.files.length > 0) {
      await tx.insert(drawingFiles).values(
        prepared.files.map((file) => ({
          id: randomUUID(),
          drawingId,
          ...file,
          createdAt: now,
        })),
      )
    }
    // A pin in Excalidraw+ becomes the importer's own star.
    if (scene.pinned) await tx.insert(stars).values({ userId, drawingId })

    return {
      status: "imported" as const,
      space,
      skippedImages: prepared.skippedImages,
    }
  })
}

/** The live top-level folder for this collection in `space`, made if missing. */
async function collectionFolder(
  tx: Tx,
  userId: string,
  space: Space,
  collection: ImportScene["collection"],
): Promise<string> {
  const [folder] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.excalidrawPlusId, collection.id),
        eq(folders.space, space),
        accessibleTo(folders, userId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1)
  if (folder) return folder.id

  const id = randomUUID()
  const now = new Date()
  await tx.insert(folders).values({
    id,
    name:
      collection.id === PRIVATE_COLLECTION
        ? "Private"
        : collection.name.trim() || "Untitled",
    space,
    createdBy: userId,
    parentId: null,
    excalidrawPlusId: collection.id,
    createdAt: now,
    updatedAt: now,
  })
  return id
}
