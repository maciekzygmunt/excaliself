// The app language, per device. Codes are Excalidraw's locale codes (its
// `languages` export), so the canvas takes them as is; labels are each
// language's own name. Order is the picker order.
export const LANGUAGES = {
  en: "English",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "pl-PL": "Polski",
  "zh-CN": "简体中文",
} as const

export type LanguageCode = keyof typeof LANGUAGES

export const DEFAULT_LANGUAGE: LanguageCode = "en"

// A cookie, not localStorage, so the server can read it too. Written only
// when the user picks a language; until then the browser language applies.
export const LANGUAGE_COOKIE = "language"

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && Object.hasOwn(LANGUAGES, value)
}

// The first preferred tag whose primary subtag we support ("fr-CA" → fr-FR),
// else English. Takes navigator.languages or the Accept-Language tags.
export function matchLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const primary = tag.split("-")[0].toLowerCase()
    for (const code of Object.keys(LANGUAGES) as LanguageCode[]) {
      if (code.split("-")[0] === primary) return code
    }
  }
  return DEFAULT_LANGUAGE
}

// The chosen language from a Cookie header or document.cookie, if valid.
export function readLanguageCookie(cookies: string): LanguageCode | null {
  for (const pair of cookies.split(";")) {
    const [name, value] = pair.trim().split("=")
    if (name === LANGUAGE_COOKIE) return isLanguageCode(value) ? value : null
  }
  return null
}

const listeners = new Set<() => void>()

export function subscribeToLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The language in this browser: the stored pick, else the browser
// language. Client only.
export function readLanguage(): LanguageCode {
  return (
    readLanguageCookie(document.cookie) ?? matchLanguage(navigator.languages)
  )
}

// The Language picker's write path: persists for a year and notifies open
// canvases.
export function setLanguage(code: LanguageCode) {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not widely supported
  document.cookie = `${LANGUAGE_COOKIE}=${code}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  for (const listener of listeners) listener()
}
