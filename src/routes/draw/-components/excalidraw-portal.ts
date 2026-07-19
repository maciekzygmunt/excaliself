import { useCallback, useLayoutEffect, useRef, useState } from "react"

// Excalidraw mounts its UI slots asynchronously; we retry for ~4s
// (240 frames at 60fps) before giving up so a portal target can be found
// without flashing the absence of our controls.
const TARGET_RESOLVE_RETRY_FRAMES = 240

export function useExcalidrawPortalTarget(
  findTarget: () => HTMLElement | null,
) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const retryRef = useRef(0)

  const resolveTarget = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const next = findTarget()
      if (targetRef.current !== next) {
        targetRef.current = next
        setTarget(next)
      }
      if (!next && retryRef.current < TARGET_RESOLVE_RETRY_FRAMES) {
        retryRef.current += 1
        resolveTarget()
      }
    })
  }, [findTarget])

  useLayoutEffect(() => {
    retryRef.current = 0
    resolveTarget()
    const onResize = () => {
      retryRef.current = 0
      resolveTarget()
    }
    window.addEventListener("resize", onResize)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", onResize)
    }
  }, [resolveTarget])

  return target
}
