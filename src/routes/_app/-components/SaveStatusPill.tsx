import { Cloud, Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { useExcalidrawPortalTarget } from "./excalidraw-portal"

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

type Props = {
  saving: boolean
  saved: boolean
}

export function SaveStatusPill({ saving, saved }: Props) {
  if (!saving && !saved) return null
  return (
    <div className="order-first mr-2 flex items-center gap-1.5 self-stretch rounded-(--border-radius-lg) bg-(--color-surface-low) px-2.5 text-xs font-(--ui-font) text-(--color-on-surface) shadow-[0_0_0_1px_var(--color-surface-lowest)] animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {saving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving...</span>
        </>
      ) : (
        <>
          <Cloud className="h-3.5 w-3.5" />
          <span>Saved</span>
        </>
      )}
    </div>
  )
}
