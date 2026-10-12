import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { Lockup, Mark } from "./identity"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderSvg(element: React.ReactElement) {
  const { container } = render(element)
  const svg = container.querySelector("svg")
  if (!svg) throw new Error("no svg rendered")
  return svg
}

test.each([
  ["Mark", <Mark key="mark" />],
  ["Lockup", <Lockup key="lockup" />],
])("%s recolors via currentColor — no hardcoded fills", (_name, element) => {
  const svg = renderSvg(element)
  const paths = svg.querySelectorAll("path")
  expect(paths.length).toBeGreaterThan(0)
  for (const path of paths) {
    expect(path.getAttribute("fill")).toBe("currentColor")
  }
})

test.each([
  ["Mark", <Mark key="mark" />],
  ["Lockup", <Lockup key="lockup" />],
])(
  "%s is decorative — hidden from the accessibility tree",
  (_name, element) => {
    const svg = renderSvg(element)
    expect(svg.getAttribute("aria-hidden")).toBe("true")
  },
)

test.each([
  ["Mark", <Mark key="mark" className="h-5 text-iris" />],
  ["Lockup", <Lockup key="lockup" className="h-5 text-iris" />],
])(
  "%s is sizable and colorable from the outside via className",
  (_name, element) => {
    const svg = renderSvg(element)
    expect(svg.classList.contains("h-5")).toBe(true)
    expect(svg.classList.contains("text-iris")).toBe(true)
  },
)
