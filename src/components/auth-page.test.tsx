import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { AuthPage } from "./auth-page"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.unstubAllGlobals()
})

function renderShell() {
  return render(
    <AuthPage title="Welcome back" subtitle="Sign in to your account">
      <button type="button">Sign in</button>
    </AuthPage>,
  )
}

test("the identity mark renders above the title — the E tile is gone", () => {
  const { container } = renderShell()
  expect(screen.queryByText("E")).toBeNull()
  const heading = screen.getByRole("heading", { name: "Welcome back" })
  const mark = container.querySelector('svg[viewBox="0 0 22 25"]')
  expect(mark).not.toBeNull()
  expect(
    // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
    mark!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

test("title, subtitle and the page's form content all render", () => {
  renderShell()
  expect(screen.getByRole("heading", { name: "Welcome back" })).toBeDefined()
  expect(screen.getByText("Sign in to your account")).toBeDefined()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined()
})

test("the illustration panel carries the tagline and hides at phone widths", () => {
  renderShell()
  const tagline = screen.getByText("Your team's whiteboard, on your server.")
  const panel = tagline.closest("[data-auth-panel]")
  expect(panel).not.toBeNull()
  // The app's single breakpoint: the panel exists only from md (768px) up.
  // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
  const classes = panel!.className
  expect(classes).toContain("hidden")
  expect(classes).toContain("md:flex")
})

test("always light — the OS preference is never consulted", () => {
  // A dark OS preference must not leak in: matchMedia is unavailable here
  // (jsdom has none) and the shell must not need it.
  const matchMediaSpy = vi.fn()
  vi.stubGlobal("matchMedia", matchMediaSpy)
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(matchMediaSpy).not.toHaveBeenCalled()
})

test("always light — the device's stored dark choice is ignored too", () => {
  // SPA-navigating in from a dark app: the shell must strip the class the
  // app applied, whatever localStorage says.
  window.localStorage.setItem("theme", "dark")
  document.documentElement.classList.add("dark")
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(false)
})

test("no wordmark lockup renders on auth pages — mark only", () => {
  const { container } = renderShell()
  expect(container.querySelector('svg[viewBox="0 0 150 24"]')).toBeNull()
})
