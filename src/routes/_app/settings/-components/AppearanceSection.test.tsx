import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { AppearanceSection } from "./AppearanceSection"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
afterEach(() => {
  document.documentElement.classList.remove("dark")
  window.localStorage.clear()
})

function checked(name: string) {
  return screen.getByRole("radio", { name }).getAttribute("aria-checked")
}

test("offers Light and Dark only — a user who never chose has Light selected", () => {
  render(<AppearanceSection />)
  expect(checked("Light")).toBe("true")
  expect(checked("Dark")).toBe("false")
  expect(screen.queryByRole("radio", { name: "System" })).toBeNull()
})

test("a stored dark choice renders with Dark selected", () => {
  window.localStorage.setItem("theme", "dark")
  render(<AppearanceSection />)
  expect(checked("Dark")).toBe("true")
})

test("picking Dark applies and persists immediately, and the control follows", () => {
  render(<AppearanceSection />)
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(window.localStorage.getItem("theme")).toBe("dark")
  expect(checked("Dark")).toBe("true")
  expect(checked("Light")).toBe("false")

  fireEvent.click(screen.getByRole("radio", { name: "Light" }))
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(window.localStorage.getItem("theme")).toBe("light")
  expect(checked("Light")).toBe("true")
})
