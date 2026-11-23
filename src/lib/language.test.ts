import { afterEach, expect, test } from "vitest"
import { extractLocaleFromRequestAsync, getLocale } from "@/paraglide/runtime"
import { matchLanguage, readLanguageCookie } from "./language"

afterEach(() => {
  document.documentElement.lang = ""
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
  expect(readLanguageCookie("language=it-IT")).toBeUndefined()
  expect(readLanguageCookie("my-language=de-DE")).toBeUndefined()
  expect(readLanguageCookie("")).toBeUndefined()
})

const request = (headers: Record<string, string>) =>
  extractLocaleFromRequestAsync(new Request("http://app.test/", { headers }))

test("a request uses the picked language, else the browser's", async () => {
  expect(
    await request({ cookie: "language=pl-PL", "accept-language": "fr-CA" }),
  ).toBe("pl-PL")
  expect(await request({ "accept-language": "fr-CA,fr;q=0.9" })).toBe("fr-FR")
  expect(await request({ "accept-language": "en;q=0.1, pl" })).toBe("pl-PL")
  expect(await request({ "accept-language": "de;q=0, es" })).toBe("es-ES")
  expect(
    await request({ cookie: "language=it-IT", "accept-language": "de" }),
  ).toBe("de-DE")
  expect(await request({})).toBe("en")
})

test("the client takes the language SSR rendered and stores nothing", () => {
  document.documentElement.lang = "es-ES"
  expect(getLocale()).toBe("es-ES")
  expect(document.cookie).toBe("")
})
