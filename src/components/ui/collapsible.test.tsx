import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible"

afterEach(cleanup)

function renderOpenCollapsible(contentProps?: { className?: string }) {
  const { container } = render(
    <Collapsible open>
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent {...contentProps}>children</CollapsibleContent>
    </Collapsible>,
  )
  const content = container.querySelector('[data-slot="collapsible-content"]')
  if (!(content instanceof HTMLElement)) throw new Error("content not found")
  return content
}

test("content carries the 150ms collapse animation classes, disabled under reduced motion", () => {
  const content = renderOpenCollapsible()
  expect(content.className).toContain("h-(--collapsible-panel-height)")
  expect(content.className).toContain("data-starting-style:h-0")
  expect(content.className).toContain("data-ending-style:h-0")
  expect(content.className).toContain("duration-150")
  expect(content.className).toContain("overflow-hidden")
  expect(content.className).toContain("motion-reduce:transition-none")
})

test("content merges caller className with the animation classes", () => {
  const content = renderOpenCollapsible({ className: "pl-2" })
  expect(content.className).toContain("pl-2")
  expect(content.className).toContain("overflow-hidden")
})
