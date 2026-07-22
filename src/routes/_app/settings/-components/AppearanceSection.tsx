import { MoonIcon, SunIcon } from "lucide-react"
import { useThemePreference } from "@/hooks/use-theme"
import { setThemePreference, type ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"

const OPTIONS: Array<{
  value: ThemePreference
  label: string
  icon: typeof SunIcon
}> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
]

// Appearance block (spec §4.4): Light / Dark for the whole app — chrome and
// the Excalidraw canvas alike — stored on this browser only. This is the
// sole theme control; the canvas has none of its own.
export function AppearanceSection() {
  const preference = useThemePreference()

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground">
          Applies to this browser, drawing canvas included
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border border-border bg-background p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = preference === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (!selected) setThemePreference(option.value)
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                selected
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <option.icon aria-hidden className="size-3.5" />
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
