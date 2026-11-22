import {
  baseLocale,
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  isServer,
  type Locale,
  locales,
  toLocale,
} from "@/paraglide/runtime"

// Each language's own name, in picker order. The codes are also
// Excalidraw's locale codes, so the canvas takes them as is.
export const LANGUAGES = {
  en: "English",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "pl-PL": "Polski",
  "zh-CN": "简体中文",
} as const satisfies Record<Locale, string>

// A cookie, so the server can render in the language. Written only when the
// user picks a language; until then the browser language applies.
export const LANGUAGE_COOKIE = "language"

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// The first preferred tag whose primary subtag we support ("fr-CA" → fr-FR),
// else English. Paraglide's own header match needs the full tag or a bare
// "fr" locale, so it would give fr-CA English.
export function matchLanguage(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.split("-")[0].toLowerCase()
    const match = locales.find((code) => code.split("-")[0] === primary)
    if (match) return match
  }
  return baseLocale
}

// The chosen language from a Cookie header, if valid.
export function readLanguageCookie(cookies: string): Locale | undefined {
  for (const pair of cookies.split(";")) {
    const [name, value] = pair.trim().split("=")
    if (name === LANGUAGE_COOKIE) return toLocale(value)
  }
}

// Server: the picked language, else the browser's.
defineCustomServerStrategy("custom-request", {
  getLocale: (request) =>
    request &&
    (readLanguageCookie(request.headers.get("cookie") ?? "") ??
      matchLanguage(
        (request.headers.get("accept-language") ?? "")
          .split(",")
          .map((tag) => tag.split(";")[0].trim()),
      )),
})

// Client: the language SSR rendered, so hydration always matches. Paraglide
// also runs it on the server outside a request (the WebSocket routes).
defineCustomClientStrategy("custom-html", {
  getLocale: () =>
    isServer ? undefined : toLocale(document.documentElement.lang),
  setLocale: () => {},
})

// The Language picker: stores the pick and reloads, so the server renders
// every page in it.
export function setLanguage(code: Locale) {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not widely supported
  document.cookie = `${LANGUAGE_COOKIE}=${code}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  location.reload()
}
