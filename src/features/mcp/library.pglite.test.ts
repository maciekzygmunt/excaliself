// @vitest-environment node
import type { LibraryItem } from "@excalidraw/excalidraw/types"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server"
import { eq } from "drizzle-orm"
import { expect, test, vi } from "vitest"
import { demoAdmin } from "@/db/demo-content"
import { createPreviewDb } from "@/db/preview"
import { drawings, libraryItems } from "@/db/schema"
import { loadImageFiles } from "./export/scene-data"
import { listLibraryItems, planLibraryPlacements } from "./library"
import { createMcpServer } from "./tools"

// No live rooms in this test; don't initialize the app's database singleton.
vi.mock("@/db", () => ({ db: undefined }))

// Imported libraries can use the same file id for unrelated images.
const imageItem = (id: string, bytes: string) => ({
  id,
  item: {
    id,
    status: "published",
    created: 1,
    elements: [
      {
        id: "i",
        type: "image",
        fileId: "logo",
        status: "saved",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
    ],
    files: {
      logo: {
        id: "logo",
        dataURL: `data:image/png;base64,${bytes}`,
        mimeType: "image/png",
        created: 1,
      },
    },
  } as unknown as LibraryItem,
})

test("copies repeated and conflicting image references without leaking or replacing bytes", async () => {
  const db = await createPreviewDb()
  await db
    .insert(libraryItems)
    .values([imageItem("first", "AQID"), imageItem("second", "BAUG")])
  const items = await listLibraryItems(db, 1, 1)
  expect(items).toEqual([
    {
      id: "first",
      name: null,
      types: ["image"],
      elementCount: 1,
      sampleText: null,
    },
  ])
  const placements = ["first", "second", "first"].map((id, x) => ({
    id,
    x,
    y: 0,
  }))
  const { elements, files } = await planLibraryPlacements(
    db,
    placements,
    0,
    "pending",
  )
  expect(files).toHaveLength(2)
  const byId = new Map<string, string>(
    files.map((file) => [file.id, file.dataURL]),
  )
  expect(elements.map((el) => byId.get(String(el.fileId)))).toEqual(
    ["AQID", "BAUG", "AQID"].map((b) => `data:image/png;base64,${b}`),
  )
  expect(
    elements.every((el) => el.fileId !== "logo" && el.status === "pending"),
  ).toBe(true)
  await expect(
    planLibraryPlacements(db, placements, 499, "pending"),
  ).rejects.toThrow(/at most/)
  await expect(
    planLibraryPlacements(
      db,
      [...placements, { id: "gone", x: 0, y: 0 }],
      0,
      "pending",
    ),
  ).rejects.toThrow(/gone/)
}, 30_000)

test("creates a drawing from just a library image, ready for export without an editor", async () => {
  const db = await createPreviewDb()
  await db.insert(libraryItems).values(imageItem("badge", "AQID"))
  const origin = "http://localhost"
  const server = createMcpServer(db, { ...demoAdmin, client: "test" }, origin)
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(
      new Request(`${origin}/api/mcp`, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_drawing",
            arguments: {
              name: "Badge",
              libraryItems: [{ id: "badge", x: 90, y: -20 }],
            },
          },
        }),
      }),
    )
    const { result } = await response.json()
    expect(result.isError, result.content[0].text).not.toBe(true)
    const { id } = JSON.parse(result.content[0].text)
    const [drawing] = await db
      .select()
      .from(drawings)
      .where(eq(drawings.id, id))
    const { elements } = JSON.parse(drawing.data ?? "null")
    expect(elements).toMatchObject([
      { type: "image", x: 90, y: -20, status: "saved" },
    ])
    const files = await loadImageFiles(db, id, elements)
    expect(files.get(elements[0].fileId)?.dataURL).toBe(
      "data:image/png;base64,AQID",
    )
  } finally {
    await server.close()
  }
}, 30_000)
