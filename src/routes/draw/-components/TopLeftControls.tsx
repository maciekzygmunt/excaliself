import { PanelLeftIcon } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

const TOP_LEFT_TARGET_RETRY_FRAMES = 240

function useTopLeftPortalTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const retryRef = useRef(0)

  const resolveTarget = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = requestAnimationFrame(() => {
      const primary = document.querySelector(
        ".excalidraw .App-menu_top__left > div:first-child",
      )
      let nextTarget: HTMLElement | null = null
      if (primary instanceof HTMLElement) {
        nextTarget = primary
      } else {
        const trigger = document.querySelector(".excalidraw .main-menu-trigger")
        const fallback = trigger?.closest("div")
        if (fallback instanceof HTMLElement) {
          nextTarget = fallback
        }
      }
      if (targetRef.current !== nextTarget) {
        targetRef.current = nextTarget
        setTarget(nextTarget)
      }
      if (!nextTarget && retryRef.current < TOP_LEFT_TARGET_RETRY_FRAMES) {
        retryRef.current += 1
        resolveTarget()
      }
    })
  }, [])

  useLayoutEffect(() => {
    retryRef.current = 0
    resolveTarget()
    const handleResize = () => {
      retryRef.current = 0
      resolveTarget()
    }
    window.addEventListener("resize", handleResize)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      window.removeEventListener("resize", handleResize)
    }
  }, [resolveTarget])

  return target
}

export function TopLeftPortal({ children }: { children: ReactNode }) {
  const target = useTopLeftPortalTarget()
  return target ? createPortal(children, target) : null
}

export function TopLeftControls({
  displayName,
  onToggleSidebar,
  onNameChange,
  onNameBlur,
}: {
  displayName: string
  onToggleSidebar: () => void
  onNameChange: (value: string) => void
  onNameBlur: (value: string) => void
}) {
  return (
    <div className="pointer-events-auto flex flex-nowrap items-center gap-[10px]">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="dropdown-menu-button [--button-bg:var(--color-surface-low)] [--button-width:var(--lg-button-size)] [--button-height:var(--lg-button-size)] shadow-[0_0_0_1px_var(--color-surface-lowest)] active:shadow-[0_0_0_1px_var(--color-brand-active)]"
        aria-label="Toggle Sidebar"
        title="Toggle Sidebar"
      >
        <PanelLeftIcon className="h-(--lg-icon-size) w-(--lg-icon-size)" />
      </button>
      <div className="relative max-w-[180px] min-w-0 overflow-hidden hidden lg:block">
        <div
          className="relative h-(--lg-button-size) border-b border-transparent bg-transparent font-semibold after:block after:w-full after:min-w-16 after:whitespace-pre after:invisible after:content-[attr(data-value)] focus-within:border-(--color-primary)"
          data-value={displayName || "Untitled Drawing"}
        >
          <input
            value={displayName}
            onChange={(event) => onNameChange(event.target.value)}
            onBlur={(event) => onNameBlur(event.target.value)}
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
