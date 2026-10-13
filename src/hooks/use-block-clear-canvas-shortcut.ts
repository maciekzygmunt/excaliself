import { useEffect } from "react"

/**
 * Swallows Cmd/Ctrl+Backspace/Delete on the canvas. Excalidraw opens its
 * "Reset the canvas" dialog on that shortcut and ignores
 * `UIOptions.canvasActions.clearCanvas`, so the flag alone can't stop it.
 * Text fields keep the key: they edit text, and Excalidraw skips them anyway.
 */
export function useBlockClearCanvasShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return
      if (!(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return
      // Capture phase on window runs before Excalidraw's container handler.
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}
