import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCanvasThemePreference, useThemePreference } from "@/hooks/use-theme"
import { LANGUAGES, setLanguage } from "@/lib/language"
import {
  type CanvasThemePreference,
  setCanvasThemePreference,
  setThemePreference,
  type ThemeChoice,
} from "@/lib/theme"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

// `label` is a message, called at render so it reads the request language.
type Option<T extends string> = {
  value: T
  label: () => string
  icon: typeof SunIcon
}

const THEME_OPTIONS: Array<Option<ThemeChoice>> = [
  { value: "light", label: m.settings_appearance_light, icon: SunIcon },
  { value: "dark", label: m.settings_appearance_dark, icon: MoonIcon },
  { value: "system", label: m.settings_appearance_system, icon: MonitorIcon },
]

const CANVAS_OPTIONS: Array<Option<CanvasThemePreference>> = [
  { value: "match", label: m.settings_appearance_match_app, icon: MonitorIcon },
  { value: "light", label: m.settings_appearance_light, icon: SunIcon },
  { value: "dark", label: m.settings_appearance_dark, icon: MoonIcon },
]

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: Array<Option<T>>
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        // A sunken well holding one raised keycap — the Etched form of a
        // segmented control.
        className="inline-flex rounded-md bg-well p-0.5 shadow-well"
      >
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (!selected) onSelect(option.value)
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[13px] transition-colors",
                selected
                  ? "border-keycap-border bg-gradient-to-b from-keycap-from to-keycap-to font-medium text-foreground shadow-keycap"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <option.icon aria-hidden className="size-3.5" />
              {option.label()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Too many choices for a segmented control, so a select.
function LanguageSelect() {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">
        {m.settings_appearance_language()}
      </p>
      <Select
        value={getLocale()}
        // Base UI's Value renders the raw value unless items provides labels
        items={LANGUAGES}
        onValueChange={(code) => code && setLanguage(code)}
      >
        <SelectTrigger
          aria-label={m.settings_appearance_language()}
          className="w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(LANGUAGES).map(([code, label]) => (
            <SelectItem key={code} value={code}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {m.settings_appearance_language_hint()}
      </p>
    </div>
  )
}

// Appearance block (spec §4.4): Theme picks Light / Dark for the app
// chrome, or System to follow the OS setting live; Canvas either follows it
// (Match app, the default) or pins the drawing canvas to a theme of its own
// (#111). Language sets the app and canvas language (#302); a pick reloads
// the page. All stored on this browser only — these are the sole theme controls; the canvas has none of
// its own.
export function AppearanceSection() {
  const preference = useThemePreference()
  const canvasPreference = useCanvasThemePreference()

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          {m.settings_appearance_title()}
        </h2>
        <p className="text-xs text-muted-foreground">
          {m.settings_appearance_description()}
        </p>
      </div>

      <div className="space-y-4">
        <ChoiceGroup
          label={m.settings_appearance_theme()}
          options={THEME_OPTIONS}
          value={preference}
          onSelect={setThemePreference}
        />
        <ChoiceGroup
          label={m.settings_appearance_canvas()}
          options={CANVAS_OPTIONS}
          value={canvasPreference}
          onSelect={setCanvasThemePreference}
        />
        <LanguageSelect />
      </div>
    </section>
  )
}
