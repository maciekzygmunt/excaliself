import { useEffect, useSyncExternalStore } from "react"
import {
  applyResolvedTheme,
  DEFAULT_THEME,
  readResolvedTheme,
  readStoredThemePreference,
  resolveCanvasTheme,
  subscribeToTheme,
  type ThemePreference,
} from "@/lib/theme"

// Pins the document to a fixed theme while the caller is mounted — the auth
// pages use it to stay light regardless of the stored choice.
export function useApplyTheme(theme: ThemePreference) {
  useEffect(() => {
    applyResolvedTheme(theme)
  }, [theme])
}

/**
 * The app shell's theme driver: applies the stored device choice on mount
 * (the pre-paint bootstrap already did on a fresh load; this covers SPA
 * navigation out of a forced-light auth page). Later changes go through
 * setThemePreference, which applies as it saves.
 */
export function useStoredTheme() {
  useEffect(() => {
    applyResolvedTheme(readStoredThemePreference() ?? DEFAULT_THEME)
  }, [])
}

// The stored choice as a reactive value — the Appearance control renders
// from this so a click updates its checked state through the store.
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeToTheme,
    () => readStoredThemePreference() ?? DEFAULT_THEME,
    () => DEFAULT_THEME,
  )
}

// The applied theme as a value — for chrome that needs it as data (the
// Toaster) rather than through CSS variables.
export function useResolvedTheme(): ThemePreference {
  return useSyncExternalStore(
    subscribeToTheme,
    readResolvedTheme,
    () => "light",
  )
}

// The drawing canvas's theme feed: switching the app theme in Settings
// re-renders any open drawing to match, live.
export function useCanvasTheme(): ThemePreference {
  return resolveCanvasTheme(useResolvedTheme())
}
