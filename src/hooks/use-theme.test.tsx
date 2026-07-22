import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { setCanvasThemePreference, setThemePreference } from "@/lib/theme"
import {
  useApplyTheme,
  useCanvasTheme,
  useCanvasThemePreference,
  useStoredTheme,
  useThemePreference,
} from "./use-theme"

afterEach(cleanup)
afterEach(() => {
  document.documentElement.classList.remove("dark")
  window.localStorage.clear()
})

function appliedDark() {
  return document.documentElement.classList.contains("dark")
}

test("useStoredTheme applies the stored device choice on mount", () => {
  window.localStorage.setItem("theme", "dark")
  renderHook(useStoredTheme)
  expect(appliedDark()).toBe(true)
})

test("useStoredTheme defaults to Light when nothing (or junk) is stored", () => {
  window.localStorage.setItem("theme", "system")
  document.documentElement.classList.add("dark")
  renderHook(useStoredTheme)
  expect(appliedDark()).toBe(false)
})

test("useApplyTheme pins the document to the given theme", () => {
  window.localStorage.setItem("theme", "dark")
  document.documentElement.classList.add("dark")
  renderHook(useApplyTheme, { initialProps: "light" as const })
  expect(appliedDark()).toBe(false)
})

test("useCanvasTheme follows the applied app theme, live", () => {
  const { result } = renderHook(useCanvasTheme)
  expect(result.current).toBe("light")

  act(() => setThemePreference("dark"))
  expect(result.current).toBe("dark")

  act(() => setThemePreference("light"))
  expect(result.current).toBe("light")
})

test("useCanvasTheme: a pinned canvas theme wins over the app theme, live", () => {
  const { result } = renderHook(useCanvasTheme)

  act(() => setCanvasThemePreference("dark"))
  expect(result.current).toBe("dark")

  act(() => setThemePreference("dark"))
  act(() => setCanvasThemePreference("light"))
  expect(result.current).toBe("light")
})

test("useCanvasTheme: Match app returns the canvas to following the app theme", () => {
  window.localStorage.setItem("theme", "dark")
  renderHook(useStoredTheme)
  const { result } = renderHook(useCanvasTheme)

  act(() => setCanvasThemePreference("light"))
  expect(result.current).toBe("light")

  act(() => setCanvasThemePreference("match"))
  expect(result.current).toBe("dark")
})

test("useCanvasThemePreference tracks setCanvasThemePreference reactively", () => {
  const { result } = renderHook(useCanvasThemePreference)
  expect(result.current).toBe("match")

  act(() => setCanvasThemePreference("dark"))
  expect(result.current).toBe("dark")
  expect(window.localStorage.getItem("canvas-theme")).toBe("dark")
})

test("useThemePreference tracks setThemePreference reactively — the round-trip", () => {
  const { result } = renderHook(useThemePreference)
  expect(result.current).toBe("light")

  act(() => setThemePreference("dark"))
  expect(result.current).toBe("dark")
  expect(window.localStorage.getItem("theme")).toBe("dark")
  expect(appliedDark()).toBe(true)

  act(() => setThemePreference("light"))
  expect(result.current).toBe("light")
  expect(appliedDark()).toBe(false)
})
