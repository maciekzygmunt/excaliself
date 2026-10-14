import { FONT_FAMILY } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useEffect } from "react"

/**
 * Starts loading the text tool's font once the scene is ready. Excalidraw only
 * fetches it when text is edited, and text committed before it arrives keeps
 * its fallback-font width for good, so it renders clipped.
 */
export function usePreloadTextFont(api: ExcalidrawImperativeAPI | null) {
  useEffect(() => {
    if (!api) return
    // The first change fires after scene init, which registers the font faces.
    const unsubscribe = api.onChange((_, appState) => {
      unsubscribe()
      const family = Object.entries(FONT_FAMILY).find(
        ([, id]) => id === appState.currentItemFontFamily,
      )
      if (family) void document.fonts.load(`20px ${family[0]}`)
    })
    return unsubscribe
  }, [api])
}
