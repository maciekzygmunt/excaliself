import { Cloud, Loader2 } from "lucide-react"

type Props = {
  saving: boolean
  saved: boolean
}

export function SaveStatusPill({ saving, saved }: Props) {
  if (!saving && !saved) return null
  return (
    <div className="pointer-events-auto absolute bottom-(--editor-container-padding) right-[calc(var(--editor-container-padding)+var(--lg-button-size)+0.5rem)] z-(--zIndex-layerUI) flex h-(--lg-button-size) items-center gap-1.5 rounded-(--border-radius-lg) bg-(--island-bg-color) px-2.5 text-xs font-(--ui-font) text-(--text-primary-color) shadow-(--shadow-island) animate-in fade-in-0 duration-200 motion-reduce:animate-none">
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
