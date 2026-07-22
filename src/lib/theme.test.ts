import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  applyResolvedTheme,
  clearStoredThemePreference,
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  storeThemePreference,
  subscribeToResolvedTheme,
  THEME_COLORS,
  themeBootstrapScript,
} from "./theme"

let meta: HTMLMetaElement

beforeEach(() => {
  meta = document.createElement("meta")
  meta.name = "theme-color"
  meta.content = THEME_COLORS.light
  document.head.appendChild(meta)
})

afterEach(() => {
  meta.remove()
  document.documentElement.classList.remove("dark")
  window.localStorage.clear()
  window.history.replaceState({}, "", "/")
  vi.unstubAllGlobals()
})

// The bootstrap script calls the global bare — jsdom ships none.
function stubSystemTheme(dark: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function runBootstrap() {
  // Evaluated the way the browser runs the inlined tag: as a bare script
  // against the document globals.
  new Function(themeBootstrapScript)()
}

function appliedDark() {
  return document.documentElement.classList.contains("dark")
}

test.each([
  ["light", false, "light"],
  ["light", true, "light"],
  ["dark", false, "dark"],
  ["dark", true, "dark"],
  ["system", false, "light"],
  ["system", true, "dark"],
] as const)("resolveTheme(%s, systemDark=%s) → %s", (pref, sys, expected) => {
  expect(resolveTheme(pref, sys)).toBe(expected)
})

test("isThemePreference accepts exactly the three preferences", () => {
  expect(isThemePreference("light")).toBe(true)
  expect(isThemePreference("dark")).toBe(true)
  expect(isThemePreference("system")).toBe(true)
  expect(isThemePreference("auto")).toBe(false)
  expect(isThemePreference(null)).toBe(false)
})

test("applyResolvedTheme drives the root class, the theme-color meta and subscribers", () => {
  const seen: string[] = []
  const unsubscribe = subscribeToResolvedTheme(() =>
    seen.push(appliedDark() ? "dark" : "light"),
  )
  applyResolvedTheme("dark")
  expect(appliedDark()).toBe(true)
  expect(meta.content).toBe(THEME_COLORS.dark)
  applyResolvedTheme("light")
  expect(appliedDark()).toBe(false)
  expect(meta.content).toBe(THEME_COLORS.light)
  expect(seen).toEqual(["dark", "light"])
  unsubscribe()
})

test("the stored mirror round-trips and rejects junk", () => {
  expect(readStoredThemePreference()).toBeNull()
  storeThemePreference("dark")
  expect(readStoredThemePreference()).toBe("dark")
  clearStoredThemePreference()
  expect(readStoredThemePreference()).toBeNull()
  window.localStorage.setItem("theme", "banana")
  expect(readStoredThemePreference()).toBeNull()
})

test("bootstrap: no stored preference defaults to Light on app pages", () => {
  stubSystemTheme(true)
  runBootstrap()
  expect(appliedDark()).toBe(false)
  expect(meta.content).toBe(THEME_COLORS.light)
})

test("bootstrap: a stored dark mirror applies before first paint", () => {
  stubSystemTheme(false)
  window.localStorage.setItem("theme", "dark")
  runBootstrap()
  expect(appliedDark()).toBe(true)
  expect(meta.content).toBe(THEME_COLORS.dark)
})

test("bootstrap: a stored system mirror resolves against the OS", () => {
  stubSystemTheme(true)
  window.localStorage.setItem("theme", "system")
  runBootstrap()
  expect(appliedDark()).toBe(true)
})

test("bootstrap: junk in the mirror falls back to the Light default", () => {
  stubSystemTheme(true)
  window.localStorage.setItem("theme", "banana")
  runBootstrap()
  expect(appliedDark()).toBe(false)
})

test.each([
  "/login",
  "/setup",
  "/invite",
  "/reset-password",
])("bootstrap: %s follows the system preference, ignoring the mirror", (path) => {
  window.history.replaceState({}, "", path)
  window.localStorage.setItem("theme", "dark")
  stubSystemTheme(false)
  runBootstrap()
  expect(appliedDark()).toBe(false)
  stubSystemTheme(true)
  runBootstrap()
  expect(appliedDark()).toBe(true)
})
