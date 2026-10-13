import { getTableColumns } from "drizzle-orm"
import { drawings } from "@/db/schema"

/**
 * Every drawing column but the scene. Lists search `searchText` instead, and
 * a card fetches its scene only once it scrolls into view.
 */
export const { data: _scene, ...drawingListColumns } = getTableColumns(drawings)
