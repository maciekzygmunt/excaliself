import { PanelLeftIcon } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

// Excalidraw mounts its top-left UI slot asynchronously; we retry for ~4s
// (240 frames at 60fps) before giving up so the portal target can be found
// without flashing the absence of our controls.
const TARGET_RESOLVE_RETRY_FRAMES = 240

const PRIMARY_TARGET_SELECTOR =
  ".excalidraw .App-menu_top__left > div:first-child"
const FALLBACK_TRIGGER_SELECTOR = ".excalidraw .main-menu-trigger"

function findPortalTarget(): HTMLElement | null {
  const primary = document.querySelector(PRIMARY_TARGET_SELECTOR)
  if (primary instanceof HTMLElement) return primary

  const trigger = document.querySelector(FALLBACK_TRIGGER_SELECTOR)
  const fallback = trigger?.closest("div")
  return fallback instanceof HTMLElement ? fallback : null
}

function useTopLeftPortalTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const retryRef = useRef(0)

  const resolveTarget = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const next = findPortalTarget()
      if (targetRef.current !== next) {
        targetRef.current = next
        setTarget(next)
      }
      if (!next && retryRef.current < TARGET_RESOLVE_RETRY_FRAMES) {
        retryRef.current += 1
        resolveTarget()
      }
    })
  }, [])

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

export function TopLeftPortal({ children }: { children: ReactNode }) {
  const target = useTopLeftPortalTarget()
  return target ? createPortal(children, target) : null
}

type Props = {
  initialName: string
  onToggleSidebar: () => void
  onSubmit: (value: string) => void
}

export function TopLeftControls({
  initialName,
  onToggleSidebar,
  onSubmit,
}: Props) {
  // Uncontrolled — the parent resets it via the `key` prop when the cached
  // name changes. Local typing state stays here without re-rendering parents.
  const [value, setValue] = useState(initialName)

  return (
    <div className="pointer-events-auto flex flex-nowrap items-center gap-2.5">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="dropdown-menu-button [--button-bg:var(--color-surface-low)] [--button-width:var(--lg-button-size)] [--button-height:var(--lg-button-size)] shadow-[0_0_0_1px_var(--color-surface-lowest)] active:shadow-[0_0_0_1px_var(--color-brand-active)]"
        aria-label="Toggle Sidebar"
        title="Toggle Sidebar"
      >
        <PanelLeftIcon className="h-(--lg-icon-size) w-(--lg-icon-size)" />
      </button>
      <div className="relative max-w-45 min-w-0 overflow-hidden hidden lg:block">
        <div
          className="relative h-(--lg-button-size) border-b border-transparent bg-transparent font-semibold after:block after:w-full after:min-w-16 after:whitespace-pre after:invisible after:content-[attr(data-value)] focus-within:border-(--color-primary)"
          data-value={value || "Untitled Drawing"}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => onSubmit(e.target.value)}
            className="absolute inset-0 h-full w-full truncate bg-transparent p-0 text-[0.95rem] font-semibold text-(--text-primary-color) shadow-none outline-none focus:cursor-text focus:ring-0 hover:text-(--color-primary)"
            placeholder="Untitled Drawing"
            title="Click to rename scene"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )
}
