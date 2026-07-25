import { expect, test } from "vitest"
import { parseStoredScene } from "./scene-store"

const stored = (scene: unknown) => JSON.stringify(scene)

test("the elements are lifted out of a serialized scene", () => {
  const data = stored({
    type: "excalidraw",
    version: 2,
    appState: { viewBackgroundColor: "#fff" },
    elements: [{ id: "rect", version: 4, versionNonce: 7, index: "a0" }],
  })

  expect(parseStoredScene(data)).toEqual([
    { id: "rect", version: 4, versionNonce: 7, index: "a0" },
  ])
})

test("an element without version fields is defaulted, the way restore() does it", () => {
  const data = stored({ elements: [{ id: "rect", type: "rectangle", x: 3 }] })

  expect(parseStoredScene(data)).toEqual([
    { id: "rect", type: "rectangle", x: 3, version: 1, versionNonce: 0 },
  ])
})

test("only entries with no usable id are skipped — the rest of the drawing survives", () => {
  const data = stored({
    elements: [
      { id: "rect", version: 1, versionNonce: 1 },
      { x: 1 },
      null,
      "no",
    ],
  })

  expect(parseStoredScene(data)).toEqual([
    { id: "rect", version: 1, versionNonce: 1 },
  ])
})

test("a blank, corrupt, or elementless drawing opens as an empty scene", () => {
  expect(parseStoredScene(undefined)).toEqual([])
  expect(parseStoredScene("")).toEqual([])
  expect(parseStoredScene("{}")).toEqual([])
  expect(parseStoredScene("not json at all")).toEqual([])
  expect(parseStoredScene(stored({ elements: "nope" }))).toEqual([])
  expect(parseStoredScene(stored(null))).toEqual([])
})
