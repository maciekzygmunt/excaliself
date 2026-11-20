// @vitest-environment node
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { beforeAll, expect, test } from "vitest"
import { demoAdmin } from "@/db/demo-content"
import type { Db } from "@/db/index"
import { createPreviewDb } from "@/db/preview"
import { drawingFiles, drawings, shares, users } from "@/db/schema"
import { MAX_DRAWING_IMAGE_BYTES } from "@/features/collab/room-files"
import { sceneRevision, syncPrivateDrawing } from "./sync-drawing"
import type { SyncRequest } from "./types"

const owner = demoAdmin.id
const other = {
  id: "offline-test-member",
  email: "offline-member@example.com",
  name: "Member",
}
const image = {
  fileId: "embedded",
  dataUrl: "data:image/png;base64,QUJDRA==",
  mimeType: "image/png",
}
const withImage = (text: string) =>
  JSON.stringify({
    elements: [
      { type: "text", text },
      { type: "image", fileId: image.fileId },
    ],
  })

let db: Db
beforeAll(async () => {
  db = await createPreviewDb()
  await db.insert(users).values(other)
}, 30_000)

function newDrawing(): SyncRequest {
  return {
    id: randomUUID(),
    name: "Flight notes",
    baseRevision: null,
    scene: { data: withImage("On device"), files: [image] },
  }
}

const savedScene = async (id: string) => {
  const [row] = await db.select().from(drawings).where(eq(drawings.id, id))
  return row
}

test("a repeated offline creation keeps one private drawing and one image", async () => {
  const draft = newDrawing()
  const response = {
    status: "saved",
    revision: sceneRevision(draft.scene.data),
  }
  expect(await syncPrivateDrawing(db, owner, draft)).toEqual(response)
  expect(await syncPrivateDrawing(db, owner, draft)).toEqual(response)
  expect(await savedScene(draft.id)).toMatchObject({
    createdBy: owner,
    data: draft.scene.data,
    name: draft.name,
    searchText: "On device",
    space: "private",
  })
  const files = await db
    .select()
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, draft.id))
  expect(files).toEqual([
    expect.objectContaining({
      fileId: image.fileId,
      bytes: Buffer.from("ABCD"),
    }),
  ])
})

test("a stale submission cannot overwrite a newer scene or its images", async () => {
  const draft = newDrawing()
  await syncPrivateDrawing(db, owner, draft)
  const edit = { ...draft, baseRevision: sceneRevision(draft.scene.data) }
  const newer = {
    ...edit,
    scene: { data: withImage("From another device"), files: [] },
  }
  expect(await syncPrivateDrawing(db, owner, newer)).toMatchObject({
    status: "saved",
  })
  expect(
    await syncPrivateDrawing(db, owner, {
      ...edit,
      scene: { data: '{"elements":[]}', files: [] },
    }),
  ).toEqual({ status: "conflict" })
  expect(await syncPrivateDrawing(db, owner, newer)).toMatchObject({
    status: "saved",
  })
  expect((await savedScene(draft.id)).data).toBe(newer.scene.data)
  expect(
    await db
      .select()
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, draft.id)),
  ).toHaveLength(1)
})

test("an update with a missing image leaves the drawing unchanged", async () => {
  const draft = newDrawing()
  const missing = draft.scene.data.replace(image.fileId, "missing")
  expect(
    await syncPrivateDrawing(db, owner, {
      ...draft,
      scene: { data: missing, files: [] },
    }),
  ).toEqual({ status: "images", missingFileIds: ["missing"] })
  expect(await savedScene(draft.id)).toBeUndefined()
  await syncPrivateDrawing(db, owner, draft)
  const edit = {
    ...draft,
    baseRevision: sceneRevision(draft.scene.data),
    scene: { data: missing, files: [] },
  }
  expect(await syncPrivateDrawing(db, owner, edit)).toEqual({
    status: "images",
    missingFileIds: ["missing"],
  })
  expect((await savedScene(draft.id)).data).toBe(draft.scene.data)
})

test("a queued edit cannot write to another owner's drawing or a shared drawing", async () => {
  const draft = newDrawing()
  await syncPrivateDrawing(db, owner, draft)
  const edit = {
    ...draft,
    baseRevision: sceneRevision(draft.scene.data),
    scene: { data: withImage("Queued"), files: [image] },
  }
  expect(await syncPrivateDrawing(db, other.id, edit)).toEqual({
    status: "conflict",
  })
  await db
    .insert(shares)
    .values({ id: randomUUID(), token: randomUUID(), drawingId: draft.id })
  expect(await syncPrivateDrawing(db, owner, edit)).toEqual({
    status: "conflict",
  })
  expect((await savedScene(draft.id)).data).toBe(draft.scene.data)
})

test("reports precisely which new image exceeds the remaining budget", async () => {
  const draft = newDrawing()
  await syncPrivateDrawing(db, owner, draft)
  await db
    .update(drawingFiles)
    .set({
      bytes: sql`decode(repeat('00', ${MAX_DRAWING_IMAGE_BYTES - 3}::int), 'hex')`,
    })
    .where(eq(drawingFiles.drawingId, draft.id))

  const extra = { ...image, fileId: "over-cap" }
  const revised = JSON.parse(withImage("Keep editing"))
  revised.elements.push({ type: "image", fileId: extra.fileId })
  const edit = {
    ...draft,
    baseRevision: sceneRevision(draft.scene.data),
    scene: { data: JSON.stringify(revised), files: [extra] },
  }
  expect(await syncPrivateDrawing(db, owner, edit)).toEqual({
    status: "images",
    overCapFileIds: [extra.fileId],
  })
  expect((await savedScene(draft.id)).data).toBe(draft.scene.data)

  revised.elements[2].status = "error"
  const withoutRejectedImage = {
    ...edit,
    scene: { data: JSON.stringify(revised), files: [] },
  }
  expect(
    await syncPrivateDrawing(db, owner, withoutRejectedImage),
  ).toMatchObject({ status: "saved" })
  expect((await savedScene(draft.id)).data).toBe(
    withoutRejectedImage.scene.data,
  )
})
