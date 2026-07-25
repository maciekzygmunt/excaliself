import { useEffect } from "react"

/**
 * Global ⌘K / Ctrl+K binding (spec §4.1). Works with the canvas focused — the
 * canvas isn't an input, so the guard below only blocks real text fields
 * (including Excalidraw's text editor).
 *
 * Excalidraw does claim ⌘K for its hyperlink editor (actionLink, active when
 * exactly one element is selected), so we swallow the event outright instead of
 * only calling preventDefault() — otherwise the palette and the link popup both
 * open. ⌘K belongs to the app; element links stay reachable via the context
 * menu and the selected-element toolbar.
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
      // Both stops: Excalidraw listens on its container (and on document when
      // handleKeyboardGlobally is set), and other window-capture listeners
      // registered before ours would still run without the immediate variant.
      e.stopPropagation()
      e.stopImmediatePropagation()
      open()
    }
    // Capture phase: Excalidraw's container stops keydown propagation, so a
    // bubble listener never fires while the canvas has focus. It also puts us
    // ahead of Excalidraw's own handlers, which is what makes the stops above
    // effective.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [open])
}
