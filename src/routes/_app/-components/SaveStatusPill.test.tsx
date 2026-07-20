import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { SaveStatusPill } from "./SaveStatusPill"

afterEach(cleanup)

test("renders nothing when neither saving nor saved", () => {
  const { container } = render(<SaveStatusPill saving={false} saved={false} />)
  expect(container.firstChild).toBeNull()
})

test("fades in with an entry-only 200ms opacity animation", () => {
  render(<SaveStatusPill saving={true} saved={false} />)
  const pill = screen.getByText("Saving...").parentElement
  expect(pill?.className).toContain("animate-in")
  expect(pill?.className).toContain("fade-in-0")
  expect(pill?.className).toContain("duration-200")
  // Opacity only — no scale or slide over the canvas.
  expect(pill?.className).not.toMatch(/zoom-in|slide-in/)
})

test("appears instantly under prefers-reduced-motion", () => {
  render(<SaveStatusPill saving={true} saved={false} />)
  const pill = screen.getByText("Saving...").parentElement
  expect(pill?.className).toContain("motion-reduce:animate-none")
})

test("aligns via the footer flex row instead of absolute offsets", () => {
  render(<SaveStatusPill saving={true} saved={false} />)
  const pill = screen.getByText("Saving...").parentElement
  expect(pill?.className).toContain("order-first")
  expect(pill?.className).toContain("self-stretch")
  expect(pill?.className).not.toContain("absolute")
})

test("swaps Saving/Saved content in place without remounting", () => {
  const { rerender } = render(<SaveStatusPill saving={true} saved={false} />)
  const pill = screen.getByText("Saving...").parentElement
  rerender(<SaveStatusPill saving={false} saved={true} />)
  expect(screen.getByText("Saved").parentElement).toBe(pill)
})
