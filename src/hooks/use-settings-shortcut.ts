import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

// Blessed global shortcut (spec §4.1): ⌘, (Ctrl+, off macOS) opens
// /settings from any authenticated surface, with the usual
// input/contentEditable guards.
export function useSettingsShortcut() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ",") return
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
      navigate({ to: "/settings" })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate])
}
