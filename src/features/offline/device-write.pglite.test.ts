// @vitest-environment node
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeAll, expect, test } from "vitest"
import { demoAdmin } from "@/db/demo-content"
import type { Db } from "@/db/index"
import { createPreviewDb } from "@/db/preview"
import { drawingFiles, drawings, shares, users } from "@/db/schema"
import { sceneRevision } from "@/features/drawings/scene-revision"
import { writeDeviceDrawing } from "./device-write"

const owner = demoAdmin.id
const other = { id: "offline-other", email: "other@example.com", name: "O" }
const image = { fileId: "img", dataUrl: "data:image/png;base64,QUJDRA==" }
const scene = (text: string) =>
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

const stored = async (id: string) =>
  (await db.select().from(drawings).where(eq(drawings.id, id)))[0]

async function madeOnDevice(text = "On the plane") {
  const draft = {
    id: randomUUID(),
    name: "Flight notes",
    baseRevision: null,
    data: scene(text),
    files: [image],
  }
  await writeDeviceDrawing(db, owner, draft)
  return draft
}

test("a drawing made on the device lands once in Private, with its image, however often it retries", async () => {
  const draft = await madeOnDevice()
  expect(await writeDeviceDrawing(db, owner, draft)).toMatchObject({
    status: "saved",
  })

  expect(await stored(draft.id)).toMatchObject({
    createdBy: owner,
    space: "private",
    name: "Flight notes",
    data: draft.data,
    searchText: "On the plane",
  })
  const files = await db
    .select()
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, draft.id))
  expect(files.map((file) => file.fileId)).toEqual([image.fileId])
})

test("an edit over the version it was based on saves, and a retry of it still saves", async () => {
  const draft = await madeOnDevice()
  const edit = {
    ...draft,
    baseRevision: await sceneRevision(draft.data),
    data: scene("Landed"),
  }

  expect(await writeDeviceDrawing(db, owner, edit)).toMatchObject({
    status: "saved",
  })
  expect(await writeDeviceDrawing(db, owner, edit)).toMatchObject({
    status: "saved",
  })
  expect((await stored(draft.id)).data).toBe(edit.data)
})

test("an edit over a version that changed elsewhere is refused and writes nothing", async () => {
  const draft = await madeOnDevice()
  const base = await sceneRevision(draft.data)
  await writeDeviceDrawing(db, owner, {
    ...draft,
    baseRevision: base,
    data: scene("From the laptop"),
  })

  expect(
    await writeDeviceDrawing(db, owner, {
      ...draft,
      baseRevision: base,
      data: scene("From the phone"),
    }),
  ).toEqual({ status: "conflict" })
  expect((await stored(draft.id)).data).toBe(scene("From the laptop"))
})

test("a drawing that is gone, trashed, another account's, or shared refuses the edit", async () => {
  const edit = async (id: string, userId = owner) => {
    const current = await stored(id)
    return writeDeviceDrawing(db, userId, {
      id,
      name: "x",
      baseRevision: await sceneRevision(current?.data ?? ""),
      data: scene("Late edit"),
      files: [],
    })
  }

  expect(await edit(randomUUID())).toEqual({ status: "conflict" })
  expect(await edit((await madeOnDevice()).id, other.id)).toEqual({
    status: "conflict",
  })

  const trashed = await madeOnDevice()
  await db
    .update(drawings)
    .set({ deletedAt: new Date() })
    .where(eq(drawings.id, trashed.id))
  expect(await edit(trashed.id)).toEqual({ status: "conflict" })

  const shared = await madeOnDevice()
  await db
    .insert(shares)
    .values({ id: randomUUID(), token: randomUUID(), drawingId: shared.id })
  expect(await edit(shared.id)).toEqual({ status: "shared" })
})

test("the SQL revision of a stored scene matches the one the device computes", async () => {
  const draft = await madeOnDevice("Zażółć 🎨")
  expect(
    await writeDeviceDrawing(db, owner, {
      ...draft,
      baseRevision: await sceneRevision(draft.data),
      data: scene("Next"),
    }),
  ).toMatchObject({ status: "saved" })
})
