import { and, eq, getTableColumns, sql } from "drizzle-orm"
import { drawings, stars } from "@/db/schema"

const { data: _scene, ...columns } = getTableColumns(drawings)

/**
 * Every drawing column but the scene, plus the caller's `starred` flag. Lists
 * search `searchText` instead, and a card fetches its scene only once it
 * scrolls into view. Needs `.leftJoin(stars, starOf(userId))`.
 */
export const drawingListColumns = {
  ...columns,
  starred: sql<boolean>`${stars.userId} is not null`,
}

/** Join condition for the caller's own star on each drawing. */
export const starOf = (userId: string) =>
  and(eq(stars.drawingId, drawings.id), eq(stars.userId, userId))
