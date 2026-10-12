import { describe, expect, test } from "vitest"
import { extractSceneText, findInScene } from "./search"

function scene(...elements: object[]) {
  return JSON.stringify({ type: "excalidraw", elements, appState: {} })
}

describe("extractSceneText", () => {
  test("collects free text and labels bound to shapes and arrows", () => {
    const data = scene(
      { type: "rectangle", id: "box", boundElements: [{ id: "label" }] },
      { type: "text", id: "free", text: "Quarterly goals" },
      { type: "text", id: "label", containerId: "box", text: "Ship search" },
      { type: "text", id: "arrow-label", containerId: "arrow", text: "then" },
    )
    expect(extractSceneText(data)).toBe("Quarterly goals Ship search then")
  })

  test("skips deleted text elements", () => {
    const data = scene(
      { type: "text", text: "kept" },
      { type: "text", text: "erased", isDeleted: true },
    )
    expect(extractSceneText(data)).toBe("kept")
  })

  test("prefers the unwrapped source over container-wrapped text", () => {
    const data = scene({
      type: "text",
      text: "authenti\ncation",
      originalText: "authentication",
    })
    expect(extractSceneText(data)).toBe("authentication")
  })

  test("collapses line breaks and runs of whitespace", () => {
    expect(extractSceneText(scene({ type: "text", text: "a\n\n  b" }))).toBe(
      "a b",
    )
  })

  test("empty and corrupt scenes have no text", () => {
    expect(extractSceneText("{}")).toBe("")
    expect(extractSceneText("{not json")).toBe("")
  })
})

describe("findInScene", () => {
  test("matches case-insensitively and returns the surrounding words", () => {
    const drawing = { data: scene({ type: "text", text: "Login flow" }) }
    expect(findInScene(drawing, "  LOGIN ")).toBe("Login flow")
    expect(findInScene(drawing, "signup")).toBeNull()
  })

  test("a deep match leads in from a word start, marked with an ellipsis", () => {
    const text = "one two three four five six seven eight nine ten eleven"
    const drawing = { data: scene({ type: "text", text }) }
    expect(findInScene(drawing, "eleven")).toBe("…eight nine ten eleven")
  })

  test("an empty query never matches", () => {
    expect(findInScene({ data: scene({ type: "text", text: "x" }) }, " ")).toBe(
      null,
    )
  })
})
