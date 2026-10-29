import { and, eq, getTableColumns, sql } from "drizzle-orm"
import { drawings, folders, stars } from "@/db/schema"

/** Every drawing column the client reads: the import source stays on the server. */
export const { excalidrawPlusId: _drawingSource, ...drawingColumns } =
  getTableColumns(drawings)

/** Every folder column the client reads; see {@link drawingColumns}. */
export const { excalidrawPlusId: _folderSource, ...folderColumns } =
  getTableColumns(folders)

const { data: _scene, ...columns } = drawingColumns

/**
 * Every client drawing column but the scene, plus the caller's `starred` flag.
 * Lists search `searchText` instead, and a card fetches its scene only once it
 * scrolls into view. Needs `.leftJoin(stars, starOf(userId))`.
 */
export const drawingListColumns = {
  ...columns,
  starred: sql<boolean>`${stars.userId} is not null`,
}

/** Join condition for the caller's own star on each drawing. */
export const starOf = (userId: string) =>
  and(eq(stars.drawingId, drawings.id), eq(stars.userId, userId))
