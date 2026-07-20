import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { documentTitle, useDocumentTitle } from "./document-title"

afterEach(cleanup)

test("bare product name when there is no page context", () => {
  expect(documentTitle()).toBe("Excaliself")
  expect(documentTitle(undefined)).toBe("Excaliself")
  expect(documentTitle("")).toBe("Excaliself")
})

test("page context first, product last", () => {
  expect(documentTitle("Roadmap sketch")).toBe("Roadmap sketch — Excaliself")
})

test("chrome pages join with a middle dot, content with an em dash", () => {
  expect(documentTitle("All drawings", { chrome: true })).toBe(
    "All drawings · Excaliself",
  )
  expect(documentTitle("", { chrome: true })).toBe("Excaliself")
})

function TitledPage({
  context,
  chrome,
}: {
  context?: string
  chrome?: boolean
}) {
  useDocumentTitle(context, { chrome })
  return null
}

test("hook supports the chrome separator", () => {
  render(<TitledPage context="All drawings" chrome />)
  expect(document.title).toBe("All drawings · Excaliself")
})

test("hook sets the tab title from the page context", () => {
  render(<TitledPage context="Roadmap sketch" />)
  expect(document.title).toBe("Roadmap sketch — Excaliself")
})

test("hook tracks renames", () => {
  const { rerender } = render(<TitledPage context="Untitled Drawing" />)
  rerender(<TitledPage context="Q3 plan" />)
  expect(document.title).toBe("Q3 plan — Excaliself")
})

test("hook falls back to the bare product name without context", () => {
  render(<TitledPage />)
  expect(document.title).toBe("Excaliself")
})

test("hook restores the bare product name on unmount", () => {
  const { unmount } = render(<TitledPage context="Roadmap sketch" />)
  unmount()
  expect(document.title).toBe("Excaliself")
})
