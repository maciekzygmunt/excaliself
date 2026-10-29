"use server"

import type { LibraryItem } from "@excalidraw/excalidraw/types"
import { createServerFn } from "@tanstack/react-start"
import { desc, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { type Db, db } from "@/db"
import { libraryItems } from "@/db/schema"
import { listUpdates } from "@/features/list-updates/hub"
import { LIBRARY_CHANGED } from "@/features/list-updates/protocol"
import { authMiddleware } from "@/middleware/auth"

// Enough of Excalidraw's LibraryItem to render; the rest is stored as is.
const libraryItemShape = z.looseObject({
  id: z.string().min(1),
  status: z.enum(["published", "unpublished"]),
  elements: z.array(z.looseObject({ id: z.string(), type: z.string() })).min(1),
  created: z.number(),
  name: z.string().optional(),
})
const libraryItem = z.custom<LibraryItem>(
  (value) => libraryItemShape.safeParse(value).success,
)

const readLibrary = async (from: Pick<Db, "select">) =>
  (
    await from
      .select({ item: libraryItems.item })
      .from(libraryItems)
      .orderBy(desc(libraryItems.seq))
  ).map((row) => row.item)

/** The team library, newest first. Members only: guests never see it. */
export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(() => readLibrary(db))

/**
 * Adds and removes items, so members editing at once never overwrite each
 * other. Re-adding an item replaces it in place. Returns the new library.
 */
export const changeLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ add: z.array(libraryItem), remove: z.array(z.string()) }),
  )
  .handler(async ({ data }) => {
    const library = await db.transaction(async (tx) => {
      if (data.remove.length > 0)
        await tx
          .delete(libraryItems)
          .where(inArray(libraryItems.id, data.remove))
      if (data.add.length > 0)
        await tx
          .insert(libraryItems)
          // `add` is newest first; the last row inserted gets the highest seq.
          .values(
            [...data.add].reverse().map((item) => ({ id: item.id, item })),
          )
          .onConflictDoUpdate({
            target: libraryItems.id,
            set: { item: sql`excluded.item` },
          })
      return readLibrary(tx)
    })
    listUpdates.notify(LIBRARY_CHANGED)
    return library
  })
