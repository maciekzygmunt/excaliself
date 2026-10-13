import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

// Excalidraw mounts its UI slots asynchronously; we retry for ~4s
// (240 frames at 60fps) before giving up so a portal target can be found
// without flashing the absence of our controls.
const TARGET_RESOLVE_RETRY_FRAMES = 240

function useExcalidrawPortalTarget(findTarget: () => HTMLElement | null) {
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

const PRIMARY_TARGET_SELECTOR =
  ".excalidraw .App-menu_top__left > div:first-child"
const FALLBACK_TRIGGER_SELECTOR = ".excalidraw .main-menu-trigger"

function findTopLeft(): HTMLElement | null {
  const primary = document.querySelector(PRIMARY_TARGET_SELECTOR)
  if (primary instanceof HTMLElement) return primary

  const trigger = document.querySelector(FALLBACK_TRIGGER_SELECTOR)
  const fallback = trigger?.closest("div")
  return fallback instanceof HTMLElement ? fallback : null
}

/** Renders beside the burger, inside Excalidraw's top-left island. */
export function TopLeftPortal({ children }: { children: ReactNode }) {
  const target = useExcalidrawPortalTarget(findTopLeft)
  return target ? createPortal(children, target) : null
}

const FOOTER_RIGHT_SELECTOR = ".excalidraw .layer-ui__wrapper__footer-right"

function findFooterRight(): HTMLElement | null {
  const target = document.querySelector(FOOTER_RIGHT_SELECTOR)
  return target instanceof HTMLElement ? target : null
}

// Renders into Excalidraw's bottom-right footer flex row (next to the help
// button), so the pill inherits the row's height and alignment instead of
// hand-tuned absolute offsets.
export function FooterRightPortal({ children }: { children: ReactNode }) {
  const target = useExcalidrawPortalTarget(findFooterRight)
  return target ? createPortal(children, target) : null
}
