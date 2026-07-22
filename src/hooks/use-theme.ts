import { useEffect, useSyncExternalStore } from "react"
import {
  applyResolvedTheme,
  applyThemePreference,
  type ResolvedTheme,
  readResolvedTheme,
  storeThemePreference,
  subscribeToResolvedTheme,
  type ThemePreference,
} from "@/lib/theme"

/**
 * Applies a theme preference to the document for as long as the caller is
 * mounted, tracking OS changes live while the preference is "system" (an OS
 * theme flip updates the app without a reload, spec §4.4). Accepts undefined
 * as "not known yet" and leaves whatever the pre-paint bootstrap applied.
 */
export function useApplyTheme(preference: ThemePreference | undefined) {
  useEffect(() => {
    if (!preference) return
    applyThemePreference(preference)
    if (preference !== "system" || typeof window.matchMedia !== "function")
      return
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyResolvedTheme(query.matches ? "dark" : "light")
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [preference])
}

/**
 * The app shell's theme driver: applies the signed-in user's server-side
 * preference (read from the currentUser cache, so an optimistic save on
 * /settings — or its rollback — re-applies in the same render pass) and
 * mirrors it to localStorage for the next load's pre-paint bootstrap.
 */
export function useUserTheme(preference: ThemePreference | undefined) {
  useApplyTheme(preference)
  useEffect(() => {
    if (preference) storeThemePreference(preference)
  }, [preference])
}

// The resolved theme as currently applied to the document — for chrome that
// needs it as a value (the Toaster) rather than through CSS variables.
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeToResolvedTheme,
    readResolvedTheme,
    () => "light",
  )
}
