// Writes one Excalidraw+ scene as a drawing, in its collection's folder. Kept
// out of server.ts so tests can drive it with a real (PGlite) db.

import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type { Db } from "@/db"
import { drawings, folders, type Space, stars, users } from "@/db/schema"
import {
  insertPreparedDrawing,
  prepareScene,
  type SceneContent,
} from "@/features/drawings/scene-import"
import { lockFolderTree, type Tx } from "@/features/folders/tree-lock"
import { accessibleTo } from "@/features/spaces/access"
import { PRIVATE_COLLECTION } from "./api"

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

/**
 * Shared collections land in Team for everyone, so only admins import them;
 * members bring their private scenes. The role is read fresh, as
 * adminMiddleware does.
 */
export async function canImportShared(
  db: Pick<Db, "select">,
  userId: string,
): Promise<boolean> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
  return user?.role === "admin"
}

/**
 * Imports one scene into the folder made for its collection, creating that
 * folder on first use. The private collection lands in Private, every other
 * one in Team. Skips a scene the member can already see a copy of.
 */
export async function importScene(
  db: Db,
  userId: string,
  input: { scene: ImportScene; content: SceneContent },
): Promise<ImportResult> {
  const { scene } = input
  const space = scene.collection.id === PRIVATE_COLLECTION ? "private" : "team"
  if (space === "team" && !(await canImportShared(db, userId)))
    throw new Error("Only admins can import shared collections")
  const prepared = prepareScene(input.content)

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
    const now = new Date()
    const drawingId = await insertPreparedDrawing(tx, prepared, {
      name: scene.name,
      folderId,
      space,
      createdBy: userId,
      createdAt: scene.created ?? now,
      updatedAt: scene.updated ?? scene.created ?? now,
      excalidrawPlusId: scene.id,
    })
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
