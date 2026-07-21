import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  File,
  Folder,
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
  useState,
} from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut"
import { cn } from "@/lib/utils"
import { Kbd } from "./sidebar/Kbd"

// Sections render in the fixed order Context → Drawings → Go to → Actions
// (spec §4.1), never score-interleaved. Go to holds exactly these four
// static rows; folder matches join it as dynamic rows while typing.
const goToRows: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/draw", label: "Home", icon: House },
  { to: "/drawings", label: "All drawings", icon: LayoutGrid },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/settings", label: "Settings", icon: Settings },
]

type PaletteRow = {
  key: string
  label: string
  icon: LucideIcon
  go: () => void
}

type PaletteSection = {
  title: string
  // Index of the section's first row in the flattened row list, so the
  // single active-row cursor can span sections
  start: number
  rows: PaletteRow[]
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
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

  const { data: drawings } = useQuery(drawingsQueryOptions())
  const { data: folders } = useQuery(foldersQueryOptions())

  const q = query.trim().toLowerCase()
  const matches = (name: string) => name.toLowerCase().includes(q)

  // Drawings is a live search only — the empty-input launcher (recents) is a
  // separate slice. getDrawings already excludes trashed rows; filter again
  // so a stale cache write can never surface one (trash is found via Trash).
  const drawingRows: PaletteRow[] =
    q === ""
      ? []
      : (drawings ?? [])
          .filter((d) => d.deletedAt === null && matches(d.name))
          .map((d) => ({
            key: `drawing-${d.id}`,
            label: d.name,
            icon: File,
            go: () => navigate({ to: "/draw/$id", params: { id: d.id } }),
          }))

  // Folders are never static Go to rows — they only appear while typing
  const folderRows: PaletteRow[] =
    q === ""
      ? []
      : (folders ?? [])
          .filter((f) => matches(f.name))
          .map((f) => ({
            key: `folder-${f.id}`,
            label: f.name,
            icon: Folder,
            go: () => navigate({ to: "/folder/$id", params: { id: f.id } }),
          }))

  let start = 0
  const sections: PaletteSection[] = [
    { title: "Drawings", rows: drawingRows },
    {
      title: "Go to",
      rows: [
        ...goToRows
          .filter((row) => matches(row.label))
          .map((row) => ({
            key: `goto-${row.to}`,
            label: row.label,
            icon: row.icon,
            go: () => navigate({ to: row.to }),
          })),
        ...folderRows,
      ],
    },
  ]
    .filter((section) => section.rows.length > 0)
    .map((section) => {
      const positioned = { ...section, start }
      start += section.rows.length
      return positioned
    })

  const rows = sections.flatMap((section) => section.rows)

  const select = (row: PaletteRow) => {
    onOpenChange(false)
    row.go()
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (rows.length) setActiveIndex((i) => (i + 1) % rows.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (rows.length)
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const row = rows[activeIndex]
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
              rows[activeIndex]
                ? `command-palette-row-${rows[activeIndex].key}`
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
          {rows.length > 0 ? (
            sections.map((section) => (
              <Fragment key={section.title}>
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                  {section.title}
                </div>
                {section.rows.map((row, j) => {
                  const i = section.start + j
                  const isActive = i === activeIndex
                  return (
                    <button
                      key={row.key}
                      id={`command-palette-row-${row.key}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => select(row)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground",
                        isActive && "bg-iris-muted",
                      )}
                    >
                      <row.icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          isActive ? "text-iris" : "text-muted-foreground/40",
                        )}
                      />
                      <span className="truncate">{row.label}</span>
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
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openCommandPalette = useCallback(() => setOpen(true), [])
  useCommandPaletteShortcut(openCommandPalette)

  return (
    <CommandPaletteContext.Provider value={{ openCommandPalette }}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
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
