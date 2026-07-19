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

function TitledPage({ context }: { context?: string }) {
  useDocumentTitle(context)
  return null
}

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
