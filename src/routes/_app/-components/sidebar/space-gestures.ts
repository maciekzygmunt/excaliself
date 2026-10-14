// The two gestures that switch the sidebar's space besides a click, ported
// from the sidebar prototype (variant A) with its numbers.

import { useCallback, useRef, type WheelEvent } from "react"
import type { Space } from "@/db/schema"

/**
 * Spring-loading, as macOS Finder folders do it: hold a drag over a space
 * segment for a moment and the sidebar switches to that space, so the item
 * can be dropped into a specific folder there.
 */
export function useSpringLoad(fire: () => void, delayMs = 450) {
  const timer = useRef<number | null>(null)
  const arm = useCallback(() => {
    if (timer.current !== null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      fire()
    }, delayMs)
  }, [fire, delayMs])
  const disarm = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])
  return { arm, disarm }
}

/**
 * Arc-style: a horizontal trackpad swipe over the panes switches space,
 * right to Team, left to Private. One switch per 600 ms, so one swipe's
 * stream of wheel events switches once.
 */
export function useSpaceSwipe(onSwipe: (space: Space) => void) {
  const lastSwipe = useRef(0)
  return (e: WheelEvent) => {
    const horizontal =
      Math.abs(e.deltaX) >= 20 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5
    if (!horizontal) return
    const now = Date.now()
    if (now - lastSwipe.current < 600) return
    lastSwipe.current = now
    onSwipe(e.deltaX > 0 ? "team" : "private")
  }
}
