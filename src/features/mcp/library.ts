import { randomUUID } from "node:crypto"
import type { FileId } from "@excalidraw/excalidraw/element/types"
import type { BinaryFileData } from "@excalidraw/excalidraw/types"
import { desc, inArray, sql } from "drizzle-orm"
import type { Db } from "@/db"
import { libraryItems } from "@/db/schema"
import type { SceneElement } from "@/features/collab/protocol"
import { MAX_ROOM_SCENE_BYTES } from "@/features/collab/room-session"
import { libraryImageFiles } from "@/features/library/image-files"
import { instantiateLibraryItem } from "./scene/library"
import { MAX_ELEMENTS, SceneInputError } from "./scene/skeleton"

/** Return enough to distinguish unnamed items without sending geometry or image bytes. */
export function listLibraryItems(db: Db, limit: number, offset: number) {
  const elements = sql`${libraryItems.item}->'elements'`
  return db
    .select({
      id: libraryItems.id,
      name: sql<string | null>`left(${libraryItems.item}->>'name', 200)`,
      elementCount: sql<number>`jsonb_array_length(${elements})`,
      types: sql<
        string[]
      >`array(select distinct el->>'type' from jsonb_array_elements(${elements}) el order by 1)`,
      sampleText: sql<
        string | null
      >`(select left(el->>'text', 120) from jsonb_array_elements(${elements}) el where el->>'type' = 'text' limit 1)`,
    })
    .from(libraryItems)
    .orderBy(desc(libraryItems.seq))
    .limit(limit)
    .offset(offset)
}

type Placement = { id: string; x: number; y: number }

export async function planLibraryPlacements(
  db: Db,
  placements: Placement[],
  added: number,
) {
  const ids = [...new Set(placements.map(({ id }) => id))]
  const rows = ids.length
    ? await db.select().from(libraryItems).where(inArray(libraryItems.id, ids))
    : []
  const sources = new Map(rows.map(({ id, item }) => [id, item]))
  const elements: SceneElement[] = []
  const files: BinaryFileData[] = []
  const changes: string[] = []
  const fileIdsByItem = new Map<string, Map<string, string>>()
  let bytes = 0
  for (const { id, x, y } of placements) {
    const item = sources.get(id)
    if (!item)
      throw new SceneInputError(
        `Unknown Team library id "${id}". Use list_library_items.`,
      )
    if (added + elements.length + item.elements.length > MAX_ELEMENTS)
      throw new SceneInputError(
        `Add at most ${MAX_ELEMENTS} elements, including library contents.`,
      )
    const copies = instantiateLibraryItem(item.elements, x, y)
    bytes += Buffer.byteLength(JSON.stringify(copies))
    if (bytes > MAX_ROOM_SCENE_BYTES)
      throw new SceneInputError(
        "The expanded library items exceed the scene size limit.",
      )
    let fileIds = fileIdsByItem.get(id)
    if (!fileIds) {
      fileIds = new Map()
      for (const file of libraryImageFiles(item)) {
        // Imported ids are not necessarily content hashes. Never overwrite a destination file.
        const fileId = randomUUID() as FileId
        fileIds.set(file.id, fileId)
        files.push({ ...file, id: fileId })
      }
      fileIdsByItem.set(id, fileIds)
    }
    for (const copy of copies) {
      if (copy.type === "image") {
        const fileId = fileIds.get(String(copy.fileId))
        if (!fileId)
          throw new SceneInputError(
            `Missing image file in library item "${id}".`,
          )
        copy.fileId = fileId
        // Room writers upload pending images, not ones saved in the source.
        copy.status = "pending"
      }
      elements.push(copy)
    }
    changes.push(`Add library item ${item.name || id} at (${x}, ${y})`)
  }
  return { elements, changes, files }
}
