// @vitest-environment node
import { eq } from "drizzle-orm"
import { beforeAll, expect, test } from "vitest"
import { demoAdmin } from "@/db/demo-content"
import type { Db } from "@/db/index"
import { createPreviewDb } from "@/db/preview"
import { drawingFiles, drawings, folders, users } from "@/db/schema"
import { copyDrawing, copyName } from "./duplicate"
import { MAX_NAME_LENGTH } from "./list-columns"

const member = { id: "member-d", email: "d@example.com", name: "D" }

let db: Db
beforeAll(async () => {
  db = await createPreviewDb()
  await db.insert(users).values(member)
  await db.insert(folders).values({
    id: "team-folder",
    name: "Folder",
    space: "team",
    createdBy: demoAdmin.id,
  })
  await db.insert(drawings).values([
    {
      id: "source",
      name: "Plan",
      data: JSON.stringify({
        elements: [{ id: "a", type: "text", text: "stored" }],
        appState: { viewBackgroundColor: "#fff" },
      }),
      searchText: "stored",
      folderId: "team-folder",
      space: "team",
      createdBy: demoAdmin.id,
    },
    {
      id: "admins-private",
      name: "Private",
      space: "private",
      createdBy: demoAdmin.id,
    },
  ])
  await db.insert(drawingFiles).values({
    id: "file-row",
    drawingId: "source",
    fileId: "img",
    mimeType: "image/png",
    bytes: Buffer.from([1, 2, 3]),
  })
}, 30_000)

const row = async (id: string) =>
  (await db.select().from(drawings).where(eq(drawings.id, id)))[0]

const files = (drawingId: string) =>
  db
    .select({ fileId: drawingFiles.fileId, bytes: drawingFiles.bytes })
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, drawingId))

test("a copy lands next to the original, with its images, owned by the caller", async () => {
  const copy = await copyDrawing(db, member.id, "source", null)

  expect(copy.name).toBe("Plan (copy)")
  const stored = await row(copy.id)
  const source = await row("source")
  expect(stored).toMatchObject({
    name: "Plan (copy)",
    data: source?.data,
    searchText: "stored",
    folderId: "team-folder",
    space: "team",
    createdBy: member.id,
  })
  expect(await files(copy.id)).toEqual(await files("source"))
}, 30_000)

test("a live Room's scene replaces the stored elements, keeping appState", async () => {
  const live = [{ id: "b", type: "text", text: "live" }]
  const copy = await copyDrawing(db, member.id, "source", live)

  const stored = await row(copy.id)
  expect(JSON.parse(stored?.data ?? "")).toEqual({
    elements: live,
    appState: { viewBackgroundColor: "#fff" },
  })
  expect(stored?.searchText).toBe("live")
}, 30_000)

test("another member's private drawing can't be copied", async () => {
  await expect(
    copyDrawing(db, member.id, "admins-private", null),
  ).rejects.toThrow("Drawing not found")
}, 30_000)

test("the copy's name still fits the limit", () => {
  const name = copyName("x".repeat(MAX_NAME_LENGTH))
  expect(name).toHaveLength(MAX_NAME_LENGTH)
  expect(name.endsWith(" (copy)")).toBe(true)
})
