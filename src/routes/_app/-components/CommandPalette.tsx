import { useNavigate } from "@tanstack/react-router"
import {
  House,
  LayoutGrid,
  type LucideIcon,
  Search,
  Settings,
  Trash2,
} from "lucide-react"
import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut"
import { cn } from "@/lib/utils"
import { Kbd } from "./sidebar/Kbd"

// A row inside a route-contributed context section. Selecting always closes
// the palette first, then runs onSelect — the palette is list-only, so text
// entry and confirmations happen in the standard dialogs it closes into.
export type PaletteContextRow = {
  id: string
  label: string
  icon: LucideIcon
  destructive?: boolean
  onSelect: () => void
}

// The palette's Context section (spec §4.1): rendered above Go to, it exists
// only on the surfaces §5 lists — routes contribute it via
// usePaletteContextSection; everywhere else the palette shows globals only.
export type PaletteContextSection = {
  title: string
  rows: PaletteContextRow[]
}

// Sections render in the fixed order Context → Drawings → Go to → Actions
// (spec §4.1). Go to is exactly these four static rows; folders arrive later
// as dynamic results, never static rows.
const goToRows: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/draw", label: "Home", icon: House },
  { to: "/drawings", label: "All drawings", icon: LayoutGrid },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/settings", label: "Settings", icon: Settings },
]

type PaletteRow = {
  id: string
  label: string
  icon: LucideIcon
  destructive?: boolean
  run: () => void
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextSection?: PaletteContextSection | null
}

export function CommandPalette({
  open,
  onOpenChange,
  contextSection,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  // The provider keeps this component mounted across opens — reset on every
  // open so the previous session's query can't leak into the next one
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
    }
  }, [open])

  const q = query.trim().toLowerCase()

  // Typing filters within sections; empty sections collapse (spec §4.1)
  const sections: { title: string; rows: PaletteRow[] }[] = [
    ...(contextSection
      ? [
          {
            title: contextSection.title,
            rows: contextSection.rows.map((row) => ({
              id: row.id,
              label: row.label,
              icon: row.icon,
              destructive: row.destructive,
              run: row.onSelect,
            })),
          },
        ]
      : []),
    {
      title: "Go to",
      rows: goToRows.map((row) => ({
        id: `goto:${row.to}`,
        label: row.label,
        icon: row.icon,
        run: () => navigate({ to: row.to }),
      })),
    },
  ]
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => row.label.toLowerCase().includes(q)),
    }))
    .filter((section) => section.rows.length > 0)

  const flatRows = sections.flatMap((section) => section.rows)

  const select = (row: PaletteRow) => {
    onOpenChange(false)
    row.run()
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (flatRows.length) setActiveIndex((i) => (i + 1) % flatRows.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (flatRows.length)
        setActiveIndex((i) => (i - 1 + flatRows.length) % flatRows.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const row = flatRows[activeIndex]
      if (row) select(row)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // The bang beats data-open:animate-in's class+attribute specificity,
        // which a bare motion-reduce:animate-none loses to (spec §4.3)
        className="top-[30%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md motion-reduce:animate-none!"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3.5">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground/50"
            strokeWidth={2.5}
          />
          <input
            // The whole palette exists to type into — focus it on open
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              flatRows[activeIndex]
                ? `command-palette-row-${flatRows[activeIndex].id}`
                : undefined
            }
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Command palette results"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {flatRows.length > 0 ? (
            sections.map((section) => (
              <Fragment key={section.title}>
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                  {section.title}
                </div>
                {section.rows.map((row) => {
                  const i = flatRows.indexOf(row)
                  const isActive = i === activeIndex
                  return (
                    <button
                      key={row.id}
                      id={`command-palette-row-${row.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => select(row)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]",
                        row.destructive
                          ? "text-destructive"
                          : "text-foreground",
                        isActive && "bg-iris-muted",
                      )}
                    >
                      <row.icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          row.destructive
                            ? "text-destructive"
                            : isActive
                              ? "text-iris"
                              : "text-muted-foreground/40",
                        )}
                      />
                      {row.label}
                    </button>
                  )
                })}
              </Fragment>
            ))
          ) : (
            <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground/60">
              No results
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CommandPaletteContextValue = {
  openCommandPalette: () => void
  registerContextSection: (section: PaletteContextSection) => () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [contextSection, setContextSection] =
    useState<PaletteContextSection | null>(null)
  const openCommandPalette = useCallback(() => setOpen(true), [])
  useCommandPaletteShortcut(openCommandPalette)

  const registerContextSection = useCallback(
    (section: PaletteContextSection) => {
      setContextSection(section)
      return () => {
        // Only clear our own registration — on a route change the incoming
        // route may have registered before this cleanup runs
        setContextSection((current) => (current === section ? null : current))
      }
    },
    [],
  )

  // Memoized so a section registration doesn't re-render every consumer —
  // a consumer that rebuilds its section on render would loop otherwise
  const value = useMemo(
    () => ({ openCommandPalette, registerContextSection }),
    [openCommandPalette, registerContextSection],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        contextSection={contextSection}
      />
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx)
    throw new Error(
      "useCommandPalette must be used within CommandPaletteProvider",
    )
  return ctx
}

/**
 * Contribute this route's context section to the palette (spec §4.1). The
 * section renders above Go to while the caller stays mounted and unregisters
 * when it unmounts or passes null. Pass a memoized section — a fresh object
 * every render re-registers needlessly.
 */
export function usePaletteContextSection(
  section: PaletteContextSection | null,
) {
  const { registerContextSection } = useCommandPalette()
  useEffect(() => {
    if (!section) return
    return registerContextSection(section)
  }, [section, registerContextSection])
}
