import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useUserTheme } from "./use-theme"

afterEach(cleanup)
afterEach(() => {
  document.documentElement.classList.remove("dark")
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

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

function appliedDark() {
  return document.documentElement.classList.contains("dark")
}

test("applies the user's preference and mirrors it to localStorage", () => {
  const { rerender } = renderHook(useUserTheme, { initialProps: "dark" })
  expect(appliedDark()).toBe(true)
  expect(window.localStorage.getItem("theme")).toBe("dark")

  // The persistence round-trip: a changed server preference re-themes and
  // re-mirrors, so the next load's pre-paint bootstrap agrees.
  rerender("light")
  expect(appliedDark()).toBe(false)
  expect(window.localStorage.getItem("theme")).toBe("light")
})

test("an unknown preference leaves the bootstrap-applied theme alone", () => {
  document.documentElement.classList.add("dark")
  renderHook(useUserTheme, { initialProps: undefined })
  expect(appliedDark()).toBe(true)
  expect(window.localStorage.getItem("theme")).toBeNull()
})

test("System tracks the OS preference live", () => {
  const system = stubSystemTheme(false)
  renderHook(useUserTheme, { initialProps: "system" })
  expect(appliedDark()).toBe(false)
  expect(window.localStorage.getItem("theme")).toBe("system")

  act(() => system.flip(true))
  expect(appliedDark()).toBe(true)
  act(() => system.flip(false))
  expect(appliedDark()).toBe(false)
})

test("leaving System stops tracking the OS", () => {
  const system = stubSystemTheme(true)
  const { rerender } = renderHook(useUserTheme, {
    initialProps: "system" as "system" | "light",
  })
  expect(appliedDark()).toBe(true)

  rerender("light")
  expect(appliedDark()).toBe(false)
  act(() => system.flip(false))
  act(() => system.flip(true))
  expect(appliedDark()).toBe(false)
})
