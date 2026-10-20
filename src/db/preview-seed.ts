import { hashPassword } from "better-auth/crypto"
import { extractSceneText } from "@/features/drawings/search"
import {
  type DemoDrawing,
  type DemoFolder,
  demoAdmin,
  demoDrawings,
  demoFolders,
} from "./demo-content.ts"
import type { Db } from "./index.ts"
import * as schema from "./schema.ts"

export type PreviewUser = {
  id: string
  name: string
  email: string
  password: string
  role: "admin" | "user"
}

/** A user who signs in with email and password, as better-auth stores one. */
export async function insertPreviewUser(db: Db, user: PreviewUser) {
  const { password, ...row } = user
  await db.insert(schema.users).values({ ...row, emailVerified: true })
  await db.insert(schema.accounts).values({
    id: `${user.id}-credential`,
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(password),
  })
}

/** An admin, so the instance is past /setup, and drawings to fill Home. */
export async function seedDemoContent(db: Db) {
  await insertPreviewUser(db, { ...demoAdmin, role: "admin" })
  await insertDemoContent(db, demoAdmin.id, {
    folders: demoFolders,
    drawings: demoDrawings,
  })
}

/** Gives `ownerId` the example folders and drawings, or a copy of them. */
export async function insertDemoContent(
  db: Db,
  ownerId: string,
  content: { folders: DemoFolder[]; drawings: DemoDrawing[] },
) {
  // Parents come first in demoFolders, so one insert satisfies the self-FK.
  await db
    .insert(schema.folders)
    .values(
      content.folders.map((folder) => ({ ...folder, createdBy: ownerId })),
    )
  for (const {
    elements,
    minutesAgo,
    starred,
    ...drawing
  } of content.drawings) {
    const data = JSON.stringify({ elements, appState: {} })
    const editedAt = new Date(Date.now() - minutesAgo * 60_000)
    await db.insert(schema.drawings).values({
      ...drawing,
      data,
      searchText: extractSceneText(data),
      createdBy: ownerId,
      createdAt: editedAt,
      updatedAt: editedAt,
    })
    if (starred) {
      await db
        .insert(schema.stars)
        .values({ userId: ownerId, drawingId: drawing.id })
    }
  }
}
