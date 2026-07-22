import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { AuthPage } from "./auth-page"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
afterEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove("dark")
  vi.unstubAllGlobals()
})

// jsdom has no matchMedia; the stub lets a test pick the OS preference and
// flip it live through the captured change listener.
function stubSystemTheme(dark: boolean) {
  let matches = dark
  const listeners = new Set<(event: { matches: boolean }) => void>()
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.delete(listener),
  }))
  return {
    flip(nextDark: boolean) {
      matches = nextDark
      for (const listener of listeners) listener({ matches: nextDark })
    },
  }
}

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

test("follows a light system preference — and a stored per-user mirror never leaks in", () => {
  // A signed-out visitor may still have the previous account's "dark"
  // mirror in localStorage; logged-out pages follow the OS, not the mirror.
  window.localStorage.setItem("theme", "dark")
  stubSystemTheme(false)
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(false)
})

test("follows a dark system preference", () => {
  stubSystemTheme(true)
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(true)
})

test("tracks an OS theme change live, without a reload", () => {
  const system = stubSystemTheme(false)
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(false)
  act(() => system.flip(true))
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  act(() => system.flip(false))
  expect(document.documentElement.classList.contains("dark")).toBe(false)
})

test("without matchMedia the shell still renders, in light", () => {
  renderShell()
  expect(document.documentElement.classList.contains("dark")).toBe(false)
})

test("no wordmark lockup renders on auth pages — mark only", () => {
  const { container } = renderShell()
  expect(container.querySelector('svg[viewBox="0 0 150 24"]')).toBeNull()
})
