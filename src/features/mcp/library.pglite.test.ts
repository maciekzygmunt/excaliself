// @vitest-environment node
import type { LibraryItem } from "@excalidraw/excalidraw/types"
import { expect, test } from "vitest"
import { createPreviewDb } from "@/db/preview"
import { libraryItems } from "@/db/schema"
import { listLibraryItems, planLibraryPlacements } from "./library"

// Imported libraries can use the same file id for unrelated images.
const imageItem = (id: string, bytes: string) => ({
  id,
  item: {
    id,
    status: "published",
    created: 1,
    elements: [{ id: "i", type: "image", fileId: "logo", status: "saved", x: 0, y: 0, width: 20, height: 20 }],
    files: { logo: { id: "logo", dataURL: `data:image/png;base64,${bytes}`, mimeType: "image/png", created: 1 } },
  } as unknown as LibraryItem,
})

test("copies repeated and conflicting image references without leaking or replacing bytes", async () => {
  const db = await createPreviewDb()
  await db.insert(libraryItems).values([imageItem("first", "AQID"), imageItem("second", "BAUG")])
  const items = await listLibraryItems(db, 1, 1)
  expect(items).toEqual([{ id: "first", name: null, types: ["image"], elementCount: 1, sampleText: null }])
  const placements = ["first", "second", "first"].map((id, x) => ({ id, x, y: 0 }))
  const { elements, files } = await planLibraryPlacements(db, placements, 0)
  expect(files).toHaveLength(2)
  const byId = new Map(files.map((file) => [file.fileId, file.dataUrl]))
  expect(elements.map((el) => byId.get(String(el.fileId)))).toEqual(
    ["AQID", "BAUG", "AQID"].map((b) => `data:image/png;base64,${b}`),
  )
  expect(elements.every((el) => el.fileId !== "logo" && el.status === "pending")).toBe(true)
  await expect(planLibraryPlacements(db, placements, 499)).rejects.toThrow(/at most/)
  await expect(planLibraryPlacements(db, [...placements, { id: "gone", x: 0, y: 0 }], 0)).rejects.toThrow(/gone/)
}, 30_000)
