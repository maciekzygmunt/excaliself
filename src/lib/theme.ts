export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

// The localStorage mirror of the per-user server-side preference. The key
// follows the next-themes convention (established by the old auth-page
// bootstrap) so existing stored values keep working.
export const THEME_STORAGE_KEY = "theme"

// Users who never chose get Light (spec §4.4).
export const DEFAULT_THEME: ThemePreference = "light"

// Browser-chrome tints for the theme-color meta: the --background tokens
// from styles.css, as hex (the dark one is oklch(0.155 0.008 60) converted).
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f2f2f6",
  dark: "#0f0b09",
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light"
  return preference
}

// jsdom (and old browsers) lack matchMedia; treat that as a light system.
export function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

// Notifies useResolvedTheme subscribers (the Toaster) on every apply.
const listeners = new Set<() => void>()

export function subscribeToResolvedTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * The single write path for the app theme: toggles the `.dark` class on the
 * root element and keeps the theme-color meta on the matching --background
 * tint. Chrome only — the Excalidraw canvas theme is deliberately not
 * touched (spec §4.4: the canvas has its own in-canvas toggle).
 */
export function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved])
  for (const listener of listeners) listener()
}

export function applyThemePreference(preference: ThemePreference) {
  applyResolvedTheme(resolveTheme(preference, systemPrefersDark()))
}

// localStorage can throw (privacy modes); the mirror is an optimization for
// pre-paint correctness, so failures are swallowed everywhere.
export function readStoredThemePreference(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : null
  } catch {
    return null
  }
}

export function storeThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {}
}

// Called on sign-out: the mirror belongs to the signed-in user, and the next
// account on this browser must start from the Light default, not inherit it.
export function clearStoredThemePreference() {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {}
}

// Logged-out pages follow the system preference regardless of any stored
// mirror (spec §4.4); these are the only routes that render logged-out.
const LOGGED_OUT_PATHS = ["/login", "/setup", "/invite", "/reset-password"]

/**
 * Inlined into the document head (after the theme-color meta) so the right
 * theme is on the root element while the SSR'd HTML is still parsing — a
 * reload never flashes the wrong theme. Mirrors resolveTheme + the
 * logged-out rule; kept dependency-free because it runs before any bundle.
 */
export const themeBootstrapScript = [
  "try{",
  `var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`,
  `if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME)};`,
  `if(${JSON.stringify(LOGGED_OUT_PATHS)}.indexOf(location.pathname)>-1)p="system";`,
  'var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);',
  'document.documentElement.classList.toggle("dark",d);',
  "var m=document.querySelector('meta[name=\"theme-color\"]');",
  `if(m)m.setAttribute("content",d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)});`,
  "}catch(e){}",
].join("")
