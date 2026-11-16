import { expect, test, vi } from "vitest"
import { buildScenePayload } from "./scene"

// Reached through the query options; their module bodies open the live db.
vi.mock("./server", () => ({}))
vi.mock("@/features/shares/server", () => ({}))

test("a deleted element is not saved", () => {
  // Excalidraw reads a 2d context at import time; jsdom has none.
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: () => ({ width: 0 }),
  })) as never
  const box = { id: "box", type: "rectangle", isDeleted: false }
  const payload = buildScenePayload({
    elements: [box, { ...box, id: "gone", isDeleted: true }] as never,
    appState: {} as never,
    files: {},
  })
  expect(
    JSON.parse(payload.data).elements.map(({ id }: { id: string }) => id),
  ).toEqual(["box"])
})
