import { Cloud, Loader2 } from "lucide-react"

type Props = {
  saving: boolean
  saved: boolean
  label?: string
  href?: string
}

export function SaveStatusPill({ saving, saved, label, href }: Props) {
  if (!saving && !saved && !label) return null
  return (
    <div
      role="status"
      className="order-first mr-2 flex items-center gap-1.5 self-stretch rounded-(--border-radius-lg) bg-(--color-surface-low) px-2.5 text-xs font-(--ui-font) text-(--color-on-surface) ring-1 ring-(--color-surface-lowest) animate-in fade-in-0 duration-200 motion-reduce:animate-none"
    >
      {label ? (
        href ? (
          <a href={href} className="underline">
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )
      ) : saving ? (
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
