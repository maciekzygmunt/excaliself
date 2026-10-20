// @vitest-environment node
import { eq, isNotNull } from "drizzle-orm"
import { beforeAll, expect, test } from "vitest"
import { demoAdmin } from "@/db/demo-content"
import type { Db } from "@/db/index"
import { createPreviewDb } from "@/db/preview"
import { drawingFiles, drawings, folders, stars, users } from "@/db/schema"
import type { SceneContent } from "@/features/drawings/scene-import"
import { type ImportScene, importScene } from "./import"

const PNG = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`

const image = (fileId: string) => ({
  type: "image",
  id: `el-${fileId}`,
  fileId,
  status: "saved",
})

const content = (
  elements: Record<string, unknown>[],
  files: Record<string, unknown> = {},
): SceneContent => ({
  elements,
  appState: { viewBackgroundColor: "#fff" },
  files,
  filesFailedToEmbed: [],
})

const scene = (id: string, collection: ImportScene["collection"]) => ({
  id,
  name: `Scene ${id}`,
  created: new Date("2024-01-02T00:00:00Z"),
  updated: new Date("2024-03-04T00:00:00Z"),
  pinned: false,
  collection,
})

let db: Db
beforeAll(async () => {
  db = await createPreviewDb()
}, 30_000)

test("imports into one folder per collection and skips what is already here", async () => {
  const userId = demoAdmin.id
  const docs = { id: "col-docs", name: "Docs" }
  const run = (id: string, collection: ImportScene["collection"]) =>
    importScene(db, userId, {
      scene: { ...scene(id, collection), pinned: id === "s1" },
      content: content([image("img")], {
        img: { mimeType: "image/png", dataURL: PNG },
      }),
    })

  expect(await run("s1", docs)).toEqual({
    status: "imported",
    space: "team",
    skippedImages: 0,
  })
  await run("s2", docs)
  await run("s3", { id: "private", name: "Private" })
  expect(await run("s1", docs)).toEqual({ status: "exists" })

  const imported = await db
    .select({
      id: drawings.id,
      name: drawings.name,
      space: drawings.space,
      folder: folders.name,
      updatedAt: drawings.updatedAt,
    })
    .from(drawings)
    .innerJoin(folders, eq(folders.id, drawings.folderId))
    .where(isNotNull(drawings.excalidrawPlusId))
  const bySource = (name: string) => imported.filter((row) => row.name === name)
  expect(imported).toHaveLength(3)
  expect(bySource("Scene s1")[0]).toMatchObject({
    space: "team",
    folder: "Docs",
    updatedAt: new Date("2024-03-04T00:00:00Z"),
  })
  expect(bySource("Scene s3")[0]).toMatchObject({
    space: "private",
    folder: "Private",
  })
  // s1 and s2 share the Docs folder.
  expect(
    new Set(
      imported.filter((row) => row.space === "team").map((row) => row.folder),
    ).size,
  ).toBe(1)

  const [file] = await db
    .select()
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, bySource("Scene s1")[0].id))
  expect(file.mimeType).toBe("image/png")
  expect(Buffer.from(file.bytes).toString()).toBe("png-bytes")

  const starred = await db
    .select({ drawingId: stars.drawingId })
    .from(stars)
    .where(eq(stars.userId, userId))
  expect(starred.map((row) => row.drawingId)).toContain(
    bySource("Scene s1")[0].id,
  )
})

test("lets a member import only their private scenes", async () => {
  await db
    .insert(users)
    .values({ id: "member", email: "member@example.com", name: "Member" })
  const run = (id: string, collection: ImportScene["collection"]) =>
    importScene(db, "member", {
      scene: scene(id, collection),
      content: content([]),
    })

  await expect(run("m1", { id: "col-docs", name: "Docs" })).rejects.toThrow(
    "Only admins can import shared collections",
  )
  expect(await run("m2", { id: "private", name: "Private" })).toMatchObject({
    status: "imported",
    space: "private",
  })
})
