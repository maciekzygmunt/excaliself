import { type ReactNode, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"

// Excalidraw mounts its UI slots late and re-creates them when it switches
// between its mobile and desktop layouts (on window or canvas resize). We
// watch the DOM and look the target up again while it is missing or detached.
function useExcalidrawPortalTarget(findTarget: () => HTMLElement | null) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let current: HTMLElement | null = null
    const resolve = () => {
      if (current?.isConnected) return
      current = findTarget()
      setTarget(current)
    }
    resolve()
    const observer = new MutationObserver(resolve)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [findTarget])

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
