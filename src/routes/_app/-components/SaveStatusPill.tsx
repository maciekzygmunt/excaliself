import { Cloud, Loader2 } from "lucide-react"

type Props = {
  saving: boolean
  saved: boolean
}

export function SaveStatusPill({ saving, saved }: Props) {
  if (!saving && !saved) return null
  return (
    <div className="order-first mr-2 flex items-center gap-1.5 self-stretch rounded-(--border-radius-lg) bg-(--color-surface-low) px-2.5 text-xs font-(--ui-font) text-(--color-on-surface) ring-1 ring-(--color-surface-lowest) animate-in fade-in-0 duration-200 motion-reduce:animate-none">
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
