export type ThemePreference = "light" | "dark"

// The device-scoped theme choice. localStorage is the source of truth —
// deliberately not synced to the account (owner decision): each browser
// keeps its own choice, and it survives sign-out. The key predates this
// module (next-themes convention), so older stored values keep working;
// anything but "dark" (including a legacy "system") reads as unset.
export const THEME_STORAGE_KEY = "theme"

// Light unless the user explicitly chose Dark in Settings. The OS
// preference is deliberately never consulted.
export const DEFAULT_THEME: ThemePreference = "light"

// Browser-chrome tints for the theme-color meta: the --background tokens
// from styles.css, as hex (the dark one is oklch(0.155 0.008 60) converted).
export const THEME_COLORS: Record<ThemePreference, string> = {
  light: "#f2f2f6",
  dark: "#0f0b09",
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark"
}

// Notifies useThemePreference/useResolvedTheme subscribers (the Appearance
// control, the Toaster) whenever the theme is applied or the choice changes.
const listeners = new Set<() => void>()

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The theme as currently applied to the document — on logged-out pages this
// is light even while a dark choice sits in storage.
export function readResolvedTheme(): ThemePreference {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * The single write path for the app theme: toggles the `.dark` class on the
 * root element and keeps the theme-color meta on the matching --background
 * tint. Chrome only — the Excalidraw canvas theme is deliberately not
 * touched (spec §4.4: the canvas has its own in-canvas toggle).
 */
export function applyResolvedTheme(resolved: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved])
  for (const listener of listeners) listener()
}

// localStorage can throw (privacy modes); an unreadable store means the
// Light default everywhere, so failures are swallowed.
export function readStoredThemePreference(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : null
  } catch {
    return null
  }
}

// The Appearance control's write path: persist and apply in one step.
// Writing localStorage can't meaningfully fail, so there is no error flow.
export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {}
  applyResolvedTheme(preference)
}

// Logged-out pages are always light regardless of the stored choice; these
// are the only routes that render logged-out.
const LOGGED_OUT_PATHS = ["/login", "/setup", "/invite", "/reset-password"]

/**
 * Inlined into the document head (after the theme-color meta) so the right
 * theme is on the root element while the SSR'd HTML is still parsing — a
 * reload never flashes the wrong theme. Dark only when explicitly stored
 * and not on a logged-out page; kept dependency-free because it runs
 * before any bundle.
 */
export const themeBootstrapScript = [
  "try{",
  `var d=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark"`,
  `&&${JSON.stringify(LOGGED_OUT_PATHS)}.indexOf(location.pathname)<0;`,
  'document.documentElement.classList.toggle("dark",d);',
  "var m=document.querySelector('meta[name=\"theme-color\"]');",
  `if(m)m.setAttribute("content",d?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)});`,
  "}catch(e){}",
].join("")
