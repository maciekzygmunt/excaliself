// Demo accounts: each visitor is a new member with their own copy of the
// example content, deleted with all of it some hours later (see instance.ts).

import { randomBytes, randomUUID } from "node:crypto"
import { and, eq, inArray, lte } from "drizzle-orm"
import type { Db } from "@/db"
import { demoDrawings, demoFolders } from "@/db/demo-content"
import { insertDemoContent, insertPreviewUser } from "@/db/preview-seed"
import { drawings, folders, users } from "@/db/schema"

/**
 * A new member, signed in by the server with a password nobody sees, and a
 * copy of the example content. New ids, so no two visitors share a row, and
 * all of it in Private, since the demo has no Team.
 */
export async function createDemoVisitor(db: Db) {
  const id = randomUUID()
  const visitor = {
    id,
    name: "Demo visitor",
    email: `visitor-${id.slice(0, 8)}@example.com`,
    password: randomBytes(24).toString("base64url"),
    role: "user" as const,
  }
  await insertPreviewUser(db, visitor)

  const folderIds: Record<string, string> = Object.fromEntries(
    demoFolders.map((folder) => [folder.id, randomUUID()]),
  )
  await insertDemoContent(db, id, {
    folders: demoFolders.map((folder) => ({
      ...folder,
      id: folderIds[folder.id],
      parentId: folder.parentId && folderIds[folder.parentId],
      space: "private",
    })),
    drawings: demoDrawings.map((drawing) => ({
      ...drawing,
      id: randomUUID(),
      folderId: drawing.folderId && folderIds[drawing.folderId],
      space: "private",
    })),
  })
  return visitor
}

/**
 * Deletes every member who signed up at or before `cutoff`, with all they
 * made. The demo's one admin is not a visitor and stays. Returns the count.
 *
 * Their live Rooms are not ended: those flush to a missing row, which
 * writes nothing.
 */
export async function deleteExpiredVisitors(
  db: Db,
  cutoff: Date,
): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "user"), lte(users.createdAt, cutoff)))
    // Before the users: a Private row must keep its creator. Files, shares
    // and stars cascade.
    await tx.delete(drawings).where(inArray(drawings.createdBy, expired))
    await tx.delete(folders).where(inArray(folders.createdBy, expired))
    const deleted = await tx
      .delete(users)
      .where(inArray(users.id, expired))
      .returning({ id: users.id })
    return deleted.length
  })
}
