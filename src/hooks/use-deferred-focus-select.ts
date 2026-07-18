import { type RefObject, useEffect } from "react"

/**
 * Focus + select an input while `active`, deferred a frame so a closing
 * dropdown's focus management runs first and doesn't steal focus back.
 */
export function useDeferredFocusSelect(
  ref: RefObject<HTMLInputElement | null>,
  active = true,
) {
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [ref, active])
}
