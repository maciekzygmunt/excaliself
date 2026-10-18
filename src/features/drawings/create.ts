// A new drawing, from the Create dialog or an MCP client. Kept out of
// server.ts so the MCP endpoint can share it.

import { randomUUID } from "node:crypto"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings, type Space } from "@/db/schema"
import { assertFolderTarget } from "@/features/folders/ownership"
import { lockFolderTree } from "@/features/folders/tree-lock"
import { sceneText } from "./search"

type Db = NodePgDatabase<typeof schema>

/**
 * Inside a folder the drawing takes the folder's space, and `space` is
 * ignored. A new drawing has no Room yet, so its first scene is written here
 * whatever its space.
 */
export async function insertDrawing(
  db: Db,
  userId: string,
  input: {
    name: string
    folderId: string | null
    space: Space
    elements: readonly Record<string, unknown>[]
  },
): Promise<{ id: string; space: Space }> {
  const id = randomUUID()
  const now = new Date()
  return db.transaction(async (tx) => {
    await lockFolderTree(tx, "place")
    const space = input.folderId
      ? await assertFolderTarget(tx, userId, input.folderId)
      : input.space
    await tx.insert(drawings).values({
      id,
      name: input.name,
      data: JSON.stringify({ elements: input.elements, appState: {} }),
      searchText: sceneText(input.elements),
      folderId: input.folderId,
      space,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    return { id, space }
  })
}
