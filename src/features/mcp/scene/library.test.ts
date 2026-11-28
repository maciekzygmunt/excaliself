// @vitest-environment node
import { expect, test } from "vitest"
import { instantiateLibraryItem } from "./library"
import { SceneInputError } from "./skeleton"

const shape = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  index: "a2",
  version: 9,
  versionNonce: 42,
  ...extra,
})

test("clones an item without changing its art, order, or internal relationships", () => {
  const customData = { tags: ["included"] }
  const source = [
    shape("frame", { type: "frame", x: -20, y: -10, width: 300, height: 150 }),
    shape("box", {
      frameId: "frame",
      groupIds: ["inner", "outer"],
      strokeColor: "#a61e4d",
      seed: 57,
      boundElements: [
        { id: "label", type: "text" },
        { id: "arrow", type: "arrow" },
      ],
      customData,
    }),
    shape("label", {
      type: "text",
      x: 10,
      y: 15,
      width: 60,
      height: 20,
      text: "Search",
      frameId: "frame",
      groupIds: ["inner", "outer"],
      containerId: "box",
    }),
    shape("arrow", {
      type: "arrow",
      x: 100,
      y: 25,
      width: 40,
      height: 0,
      frameId: "frame",
      groupIds: ["outer"],
      points: [
        [0, 0],
        [40, 0],
      ],
      startBinding: { elementId: "box", fixedPoint: [1, 0.5], mode: "orbit" },
      endBinding: { elementId: "image", fixedPoint: [0, 0.5], mode: "inside" },
      boundElements: [{ id: "arrow-label", type: "text" }],
    }),
    shape("arrow-label", {
      type: "text",
      x: 105,
      y: 10,
      width: 30,
      height: 12,
      text: "To",
      containerId: "arrow",
    }),
    shape("image", {
      type: "image",
      x: 140,
      fileId: "image-content-key",
      scale: [-1, 1],
      crop: { x: 0, y: 0, width: 80, height: 20 },
      frameId: "frame",
      groupIds: ["outer"],
      boundElements: [{ id: "arrow", type: "arrow" }],
    }),
  ]
  const before = structuredClone(source)
  const cloned = instantiateLibraryItem(source, 500, -300)
  const [frame, box, label, arrow, arrowLabel, image] = cloned
  const [inner, outer] = box.groupIds as string[]

  expect(frame).toMatchObject({ type: "frame", x: 500, y: -300 })
  expect(box).toMatchObject({
    x: 520,
    y: -290,
    width: 100,
    height: 50,
    strokeColor: "#a61e4d",
    seed: 57,
    frameId: frame.id,
    boundElements: [
      { id: label.id, type: "text" },
      { id: arrow.id, type: "arrow" },
    ],
    customData: { tags: ["included"] },
  })
  expect(label).toMatchObject({
    x: 530,
    y: -275,
    text: "Search",
    frameId: frame.id,
    containerId: box.id,
    groupIds: [inner, outer],
  })
  expect(arrow).toMatchObject({
    frameId: frame.id,
    groupIds: [outer],
    points: [
      [0, 0],
      [40, 0],
    ],
    startBinding: { elementId: box.id, fixedPoint: [1, 0.5], mode: "orbit" },
    endBinding: { elementId: image.id, fixedPoint: [0, 0.5], mode: "inside" },
    boundElements: [{ id: arrowLabel.id, type: "text" }],
  })
  expect(arrowLabel).toMatchObject({ text: "To", containerId: arrow.id })
  expect(image).toMatchObject({
    fileId: "image-content-key",
    scale: [-1, 1],
    crop: { x: 0, y: 0, width: 80, height: 20 },
    frameId: frame.id,
    groupIds: [outer],
    boundElements: [{ id: arrow.id, type: "arrow" }],
  })
  expect(source).toEqual(before)

  const again = instantiateLibraryItem(source, 500, -300)
  const freshIds = new Set([
    ...source.map(({ id }) => id),
    ...again.map(({ id }) => id),
    ...cloned.map(({ id }) => id),
  ])
  expect(freshIds.size).toBe(source.length * 3)
  expect([inner, outer]).not.toContain("inner")
  expect([inner, outer]).not.toContain("outer")
  expect(inner).not.toBe(outer)
  expect(again[1].groupIds).not.toEqual(box.groupIds)
  for (const element of cloned) {
    expect(element).toMatchObject({ index: null, version: 1 })
    expect(element.versionNonce).toBeGreaterThan(0)
  }
})

test("detaches valid references to elements outside the item", () => {
  const [text, arrow, box] = instantiateLibraryItem(
    [
      shape("text", {
        type: "text",
        text: "Standalone",
        frameId: "destination-frame",
        containerId: "destination-container",
      }),
      shape("arrow", {
        type: "arrow",
        points: [
          [0, 0],
          [100, 0],
        ],
        startBinding: { elementId: "destination-box" },
        endBinding: { elementId: "box" },
      }),
      shape("box", {
        boundElements: [
          { id: "destination-arrow", type: "arrow" },
          { id: "arrow", type: "arrow" },
        ],
      }),
    ],
    0,
    0,
  )
  expect(text).toMatchObject({ frameId: null, containerId: null })
  expect(arrow).toMatchObject({
    startBinding: null,
    endBinding: { elementId: box.id },
  })
  expect(box.boundElements).toEqual([{ id: arrow.id, type: "arrow" }])
})

test("places the leftmost and topmost point at the given position", () => {
  const [line, box] = instantiateLibraryItem(
    [
      shape("line", {
        type: "line",
        x: 50,
        y: 20,
        points: [
          [0, 0],
          [-100, -30],
        ],
      }),
      shape("box", { y: 15 }),
    ],
    100,
    200,
  )
  expect(line).toMatchObject({
    x: 200,
    y: 230,
    points: [
      [0, 0],
      [-100, -30],
    ],
  })
  expect(box).toMatchObject({ x: 150, y: 225 })
})

test.each<[string, unknown]>([
  ["a non-array", null],
  ["an empty item", []],
  ["an unknown element type", [shape("box", { type: "circle" })]],
  ["a blank id", [shape("")]],
  ["duplicate element ids", [shape("box"), shape("box")]],
  ["only deleted elements", [shape("box", { isDeleted: true })]],
  ["non-finite coordinates", [shape("box", { x: Infinity })]],
  ["non-finite width", [shape("box", { width: Number.NaN })]],
  [
    "malformed points",
    [shape("line", { type: "line", points: [[0, 0], [1]] })],
  ],
  [
    "a malformed reverse binding",
    [shape("box", { boundElements: [{ type: "arrow" }] })],
  ],
  [
    "a malformed endpoint binding",
    [
      shape("arrow", {
        type: "arrow",
        points: [
          [0, 0],
          [1, 1],
        ],
        startBinding: { elementId: 17 },
      }),
    ],
  ],
  ["malformed groups", [shape("box", { groupIds: [45] })]],
])("rejects %s instead of cloning a partial item", (_, input) => {
  expect(() => instantiateLibraryItem(input, 0, 0)).toThrow(SceneInputError)
})
