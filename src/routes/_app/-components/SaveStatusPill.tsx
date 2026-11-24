import { Cloud, CloudOff, Loader2 } from "lucide-react"
import { m } from "@/paraglide/messages"

type Props = {
  saving: boolean
  saved: boolean
  /** The last save failed, and the edits wait on this device. */
  onDevice?: boolean
}

export function SaveStatusPill({ saving, saved, onDevice }: Props) {
  if (!saving && !saved && !onDevice) return null
  return (
    <div className="order-first mr-2 flex items-center gap-1.5 self-stretch rounded-(--border-radius-lg) bg-(--color-surface-low) px-2.5 text-xs font-(--ui-font) text-(--color-on-surface) ring-1 ring-(--color-surface-lowest) animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {saving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{m.drawing_saving()}</span>
        </>
      ) : onDevice ? (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>{m.offline_status_waiting()}</span>
        </>
      ) : (
        <>
          <Cloud className="h-3.5 w-3.5" />
          <span>{m.drawing_saved()}</span>
        </>
      )}
    </div>
  )
}
