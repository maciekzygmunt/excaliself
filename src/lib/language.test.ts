import { afterEach, expect, test, vi } from "vitest"
import {
  matchLanguage,
  readLanguage,
  readLanguageCookie,
  setLanguage,
  subscribeToLanguage,
} from "./language"

afterEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: clears the cookie under test
  document.cookie = "language=; path=/; max-age=0"
  vi.restoreAllMocks()
})

test("matches the first supported tag by primary subtag", () => {
  expect(matchLanguage(["fr-CA", "de-DE"])).toBe("fr-FR")
  expect(matchLanguage(["it-IT", "PL"])).toBe("pl-PL")
  expect(matchLanguage(["en-GB"])).toBe("en")
  expect(matchLanguage(["zh"])).toBe("zh-CN")
})

test("falls back to English when nothing matches", () => {
  expect(matchLanguage(["it-IT", "ja"])).toBe("en")
  expect(matchLanguage([])).toBe("en")
})

test("reads only a supported code from the cookie", () => {
  expect(readLanguageCookie("a=1; language=de-DE; b=2")).toBe("de-DE")
  expect(readLanguageCookie("language=it-IT")).toBeNull()
  expect(readLanguageCookie("my-language=de-DE")).toBeNull()
  expect(readLanguageCookie("")).toBeNull()
})

test("the browser language applies until a pick is stored", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-MX", "en"])
  expect(readLanguage()).toBe("es-ES")
  expect(document.cookie).toBe("")

  const listener = vi.fn()
  const unsubscribe = subscribeToLanguage(listener)
  setLanguage("pl-PL")
  unsubscribe()

  expect(listener).toHaveBeenCalledOnce()
  expect(document.cookie).toBe("language=pl-PL")
  expect(readLanguage()).toBe("pl-PL")
})
