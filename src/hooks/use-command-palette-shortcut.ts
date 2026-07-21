import { useEffect } from "react"

/**
 * Global ⌘K / Ctrl+K binding (spec §4.1). Works with the canvas focused —
 * Excalidraw doesn't claim ⌘K and the canvas isn't an input, so the guard
 * below only blocks real text fields (including Excalidraw's text editor).
 */
export function useCommandPaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "k" && e.key !== "K") return
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return
      e.preventDefault()
      open()
    }
    // Capture phase: Excalidraw's container stops keydown propagation, so a
    // bubble listener never fires while the canvas has focus.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])
}
