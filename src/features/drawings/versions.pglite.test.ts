// @vitest-environment node
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { expect, test } from "vitest"
import type { Db } from "@/db"
import { demoAdmin } from "@/db/demo-content"
import { createPreviewDb } from "@/db/preview"
import {
  drawingFiles,
  drawings,
  drawingVersionFiles,
  drawingVersions,
} from "@/db/schema"
import { storedImageBytes } from "@/features/collab/room-file-store"
import { saveRoomScene } from "@/features/collab/scene-store"
import { insertDrawing } from "./create"
import { writeDrawingScene } from "./scene-write"
import {
  listDrawingVersions,
  MAX_VERSIONS,
  restoreVersionAsCopy,
} from "./versions"

const MINUTE = 60 * 1000
const rect = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  ...extra,
})
const image = (fileId: string) => ({ ...rect(fileId), type: "image", fileId })

async function setup(elements: Record<string, unknown>[]) {
  const db = await createPreviewDb()
  const { id } = await insertDrawing(db, demoAdmin.id, {
    name: "Plan",
    folderId: null,
    space: "private",
    elements,
  })
  return { db, id }
}

/** Last edit `editedAgo` ago; the drawing itself is older still. */
const lastEdited = (db: Db, id: string, editedAgo: number) =>
  db
    .update(drawings)
    .set({
      updatedAt: new Date(Date.now() - editedAgo),
      createdAt: new Date(Date.now() - 24 * 60 * MINUTE),
    })
    .where(eq(drawings.id, id))

const save = (db: Db, id: string, elements: Record<string, unknown>[]) =>
  writeDrawingScene(db, demoAdmin.id, {
    id,
    data: JSON.stringify({ elements, appState: {} }),
    files: [],
  })

const versionScenes = async (db: Db, id: string) =>
  (
    await db
      .select({ data: drawingVersions.data })
      .from(drawingVersions)
      .where(eq(drawingVersions.drawingId, id))
      .orderBy(drawingVersions.createdAt)
  ).map((row) =>
    JSON.parse(row.data).elements.map((el: { id: string }) => el.id),
  )

test("a new editing session keeps the scene from before it, once", async () => {
  const { db, id } = await setup([rect("a"), rect("gone", { isDeleted: true })])
  await lastEdited(db, id, 11 * MINUTE)

  await save(db, id, [rect("a"), rect("b")])
  await save(db, id, [rect("a"), rect("b"), rect("c")])

  // Tombstones are not part of a version.
  expect(await versionScenes(db, id)).toEqual([["a"]])
  // Listed at the time that scene was saved, not when the version was taken.
  const [version] = await listDrawingVersions(db, demoAdmin.id, id)
  expect(Date.now() - version.savedAt.getTime()).toBeGreaterThan(10 * MINUTE)
}, 30_000)

test("a long session gets a checkpoint; unchanged and empty scenes get none", async () => {
  const { db, id } = await setup([rect("a")])
  // Edited a minute ago, but no version for over 30 minutes.
  await lastEdited(db, id, MINUTE)
  await save(db, id, [rect("a")])
  expect(await versionScenes(db, id)).toEqual([["a"]])

  // The scene before this session is the one the last version holds.
  await lastEdited(db, id, 11 * MINUTE)
  await save(db, id, [rect("a"), rect("b")])
  expect(await versionScenes(db, id)).toHaveLength(1)

  const blank = await setup([])
  await lastEdited(blank.db, blank.id, 11 * MINUTE)
  await save(blank.db, blank.id, [rect("a")])
  expect(await versionScenes(blank.db, blank.id)).toEqual([])
}, 60_000)

test(`only the newest ${MAX_VERSIONS} versions and their images are kept`, async () => {
  const { db, id } = await setup([rect("now")])
  const oldest = randomUUID()
  await db.insert(drawingVersions).values(
    Array.from({ length: MAX_VERSIONS }, (_, i) => ({
      id: i === 0 ? oldest : randomUUID(),
      drawingId: id,
      data: JSON.stringify({ elements: [rect(`v${i}`)] }),
      fileIds: i === 0 ? ["old-img"] : [],
      savedAt: new Date(Date.now() - (MAX_VERSIONS - i) * 60 * MINUTE),
      createdAt: new Date(Date.now() - (MAX_VERSIONS - i) * 60 * MINUTE),
    })),
  )
  await db.insert(drawingVersionFiles).values({
    drawingId: id,
    fileId: "old-img",
    mimeType: "image/png",
    bytes: Buffer.from("png"),
  })
  await lastEdited(db, id, 11 * MINUTE)

  await save(db, id, [rect("next")])

  const kept = await db
    .select({ id: drawingVersions.id })
    .from(drawingVersions)
    .where(eq(drawingVersions.drawingId, id))
  expect(kept).toHaveLength(MAX_VERSIONS)
  expect(kept.map((v) => v.id)).not.toContain(oldest)
  expect(
    await db
      .select()
      .from(drawingVersionFiles)
      .where(eq(drawingVersionFiles.drawingId, id)),
  ).toEqual([])
}, 30_000)

test("an image removed from the canvas stays restorable without using the cap", async () => {
  const { db, id } = await setup([rect("a"), image("img")])
  await db.insert(drawingFiles).values({
    id: randomUUID(),
    drawingId: id,
    fileId: "img",
    mimeType: "image/png",
    bytes: Buffer.from("png-bytes"),
    createdAt: new Date(Date.now() - 2 * 60 * MINUTE),
  })
  await lastEdited(db, id, 11 * MINUTE)

  // A Room flush that no longer has the image.
  await saveRoomScene(db, id, [rect("a")])

  expect(await storedImageBytes(db, id)).toBe(0)
  const [version] = await listDrawingVersions(db, demoAdmin.id, id)
  // Another member can't see a Private drawing's history.
  expect(await listDrawingVersions(db, "someone-else", id)).toEqual([])
  await expect(
    restoreVersionAsCopy(db, "someone-else", version.id),
  ).rejects.toThrow("Version not found")

  const copyId = await restoreVersionAsCopy(db, demoAdmin.id, version.id)

  const [copy] = await db
    .select({ name: drawings.name, data: drawings.data, space: drawings.space })
    .from(drawings)
    .where(eq(drawings.id, copyId))
  expect(copy.name).toBe("Plan (restored)")
  expect(copy.space).toBe("private")
  expect(
    JSON.parse(copy.data).elements.find(
      (el: { id: string }) => el.id === "img",
    ),
  ).toMatchObject({ status: "saved" })
  const [file] = await db
    .select({ bytes: drawingFiles.bytes })
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, copyId))
  expect(file.bytes.toString()).toBe("png-bytes")
}, 30_000)
