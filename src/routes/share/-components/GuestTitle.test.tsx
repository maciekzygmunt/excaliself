import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { GuestTitle } from "./GuestTitle"

afterEach(cleanup)

test("the drawing's name carries a muted 'Shared' suffix", () => {
  render(<GuestTitle name="Roadmap Q3" />)
  expect(screen.getByTitle("Roadmap Q3").textContent).toBe("Roadmap Q3")
  expect(screen.getByText("Shared")).toBeTruthy()
})

test("a nameless drawing still reads as something", () => {
  render(<GuestTitle name="" />)
  expect(screen.getByTitle("Untitled Drawing")).toBeTruthy()
})
