import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  applyResolvedTheme,
  isCanvasThemePreference,
  isThemePreference,
  readStoredCanvasThemePreference,
  readStoredThemePreference,
  resolveCanvasTheme,
  setCanvasThemePreference,
  setThemePreference,
  subscribeToTheme,
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

function runBootstrap() {
  // Evaluated the way the browser runs the inlined tag: as a bare script
  // against the document globals.
  new Function(themeBootstrapScript)()
}

function appliedDark() {
  return document.documentElement.classList.contains("dark")
}

test("isThemePreference accepts exactly light and dark — no system tier", () => {
  expect(isThemePreference("light")).toBe(true)
  expect(isThemePreference("dark")).toBe(true)
  expect(isThemePreference("system")).toBe(false)
  expect(isThemePreference(null)).toBe(false)
})

test("applyResolvedTheme drives the root class, the theme-color meta and subscribers", () => {
  const seen: string[] = []
  const unsubscribe = subscribeToTheme(() =>
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

test("setThemePreference persists and applies in one step — the round-trip", () => {
  setThemePreference("dark")
  expect(window.localStorage.getItem("theme")).toBe("dark")
  expect(appliedDark()).toBe(true)
  expect(readStoredThemePreference()).toBe("dark")

  setThemePreference("light")
  expect(window.localStorage.getItem("theme")).toBe("light")
  expect(appliedDark()).toBe(false)
})

test("junk in storage — including a legacy 'system' — reads as unset", () => {
  window.localStorage.setItem("theme", "system")
  expect(readStoredThemePreference()).toBeNull()
  window.localStorage.setItem("theme", "banana")
  expect(readStoredThemePreference()).toBeNull()
})

test("resolveCanvasTheme: Match app follows the app theme", () => {
  expect(resolveCanvasTheme("light", "match")).toBe("light")
  expect(resolveCanvasTheme("dark", "match")).toBe("dark")
})

test("resolveCanvasTheme: a Light or Dark override wins over the app theme", () => {
  expect(resolveCanvasTheme("dark", "light")).toBe("light")
  expect(resolveCanvasTheme("light", "dark")).toBe("dark")
  expect(resolveCanvasTheme("light", "light")).toBe("light")
  expect(resolveCanvasTheme("dark", "dark")).toBe("dark")
})

test("isCanvasThemePreference accepts exactly match, light and dark", () => {
  expect(isCanvasThemePreference("match")).toBe(true)
  expect(isCanvasThemePreference("light")).toBe(true)
  expect(isCanvasThemePreference("dark")).toBe(true)
  expect(isCanvasThemePreference("system")).toBe(false)
  expect(isCanvasThemePreference(null)).toBe(false)
})

test("setCanvasThemePreference persists, notifies subscribers, and never touches the document", () => {
  const seen: string[] = []
  const unsubscribe = subscribeToTheme(() =>
    seen.push(readStoredCanvasThemePreference()),
  )
  setCanvasThemePreference("dark")
  expect(window.localStorage.getItem("canvas-theme")).toBe("dark")
  expect(readStoredCanvasThemePreference()).toBe("dark")
  expect(appliedDark()).toBe(false)

  setCanvasThemePreference("match")
  expect(readStoredCanvasThemePreference()).toBe("match")
  expect(seen).toEqual(["dark", "match"])
  unsubscribe()
})

test("nothing stored, junk, or a legacy value reads as Match app", () => {
  expect(readStoredCanvasThemePreference()).toBe("match")
  window.localStorage.setItem("canvas-theme", "system")
  expect(readStoredCanvasThemePreference()).toBe("match")
  window.localStorage.setItem("canvas-theme", "banana")
  expect(readStoredCanvasThemePreference()).toBe("match")
})

test("changing the app theme never alters the stored canvas preference", () => {
  setCanvasThemePreference("light")
  setThemePreference("dark")
  expect(readStoredCanvasThemePreference()).toBe("light")
  setThemePreference("light")
  expect(readStoredCanvasThemePreference()).toBe("light")
})

test("bootstrap: nothing stored means Light, and the OS is never consulted", () => {
  const matchMediaSpy = vi.fn()
  vi.stubGlobal("matchMedia", matchMediaSpy)
  runBootstrap()
  expect(appliedDark()).toBe(false)
  expect(meta.content).toBe(THEME_COLORS.light)
  expect(matchMediaSpy).not.toHaveBeenCalled()
})

test("bootstrap: a stored dark choice applies before first paint", () => {
  window.localStorage.setItem("theme", "dark")
  runBootstrap()
  expect(appliedDark()).toBe(true)
  expect(meta.content).toBe(THEME_COLORS.dark)
})

test("bootstrap: a legacy 'system' value falls back to Light", () => {
  window.localStorage.setItem("theme", "system")
  runBootstrap()
  expect(appliedDark()).toBe(false)
})

test.each(["/login", "/setup", "/invite", "/reset-password"])(
  "bootstrap: %s is always light, even with a stored dark choice",
  (path) => {
    window.history.replaceState({}, "", path)
    window.localStorage.setItem("theme", "dark")
    document.documentElement.classList.add("dark")
    runBootstrap()
    expect(appliedDark()).toBe(false)
    expect(meta.content).toBe(THEME_COLORS.light)
  },
)
