import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { setThemePreference } from "@/lib/theme"
import {
  useApplyTheme,
  useCanvasTheme,
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
