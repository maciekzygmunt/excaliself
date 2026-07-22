import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useUpdateTheme } from "@/features/account/mutations"
import type { CurrentUser } from "@/features/account/queries"
import type { ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"

const OPTIONS: Array<{
  value: ThemePreference
  label: string
  icon: typeof SunIcon
}> = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
]

// Appearance block (spec §4.4): Light / Dark / System for the app chrome,
// saved per-user with optimistic apply. The Excalidraw canvas keeps its own
// in-canvas theme toggle and is deliberately not governed by this.
export function AppearanceSection({ user }: { user: CurrentUser }) {
  const updateTheme = useUpdateTheme()

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Appearance</h2>
        <p className="text-xs text-muted-foreground">
          Theme for the app — the canvas has its own theme toggle
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border border-border bg-background p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = user.theme === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (!selected) updateTheme(option.value)
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
