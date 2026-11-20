import { useEffect, useSyncExternalStore } from "react"
import {
  DEFAULT_LANGUAGE,
  type LanguageCode,
  readLanguage,
  subscribeToLanguage,
} from "@/lib/language"

// The device language as a reactive value: the Language picker and every
// Excalidraw canvas render from it, so a pick applies live. The server
// renders English; the canvas only mounts on the client, so it never shows
// that default.
export function useLanguage(): LanguageCode {
  return useSyncExternalStore(
    subscribeToLanguage,
    readLanguage,
    () => DEFAULT_LANGUAGE,
  )
}

// useLanguage for a page's main canvas. Excalidraw sets <html lang> to its
// language and leaves it there, so this puts back English, the app's
// language, when the canvas goes.
export function useCanvasLanguage(): LanguageCode {
  useEffect(
    () => () => {
      document.documentElement.lang = DEFAULT_LANGUAGE
    },
    [],
  )
  return useLanguage()
}
