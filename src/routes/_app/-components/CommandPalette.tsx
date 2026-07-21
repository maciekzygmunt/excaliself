import { useNavigate } from "@tanstack/react-router"
import {
  File,
  Folder,
  House,
  LayoutGrid,
  LogOut,
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
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { useCreateDialog } from "./CreateDialog"
import { Kbd } from "./sidebar/Kbd"

// Sections render in the fixed order Context → Drawings → Go to → Actions
// (spec §4.1). Go to holds exactly these four static rows (folders arrive
// later as dynamic results, never static rows); Actions exactly these three —
// no theme row, no invite actions.
type PaletteRow =
  | { kind: "goto"; id: string; label: string; icon: LucideIcon; to: string }
  | {
      kind: "action"
      id: "new-drawing" | "new-folder" | "sign-out"
      label: string
      icon: LucideIcon
    }

const goToRows: PaletteRow[] = [
  { kind: "goto", id: "home", label: "Home", icon: House, to: "/draw" },
  {
    kind: "goto",
    id: "drawings",
    label: "All drawings",
    icon: LayoutGrid,
    to: "/drawings",
  },
  { kind: "goto", id: "trash", label: "Trash", icon: Trash2, to: "/trash" },
  {
    kind: "goto",
    id: "settings",
    label: "Settings",
    icon: Settings,
    to: "/settings",
  },
]

const actionRows: PaletteRow[] = [
  { kind: "action", id: "new-drawing", label: "New drawing", icon: File },
  { kind: "action", id: "new-folder", label: "New folder", icon: Folder },
  { kind: "action", id: "sign-out", label: "Sign out", icon: LogOut },
]

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { openCreateDrawingDialog, openCreateFolderDialog } = useCreateDialog()
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
  const matches = (row: PaletteRow) => row.label.toLowerCase().includes(q)
  // Empty sections collapse; activeIndex runs across the remaining sections
  // so arrow keys walk the whole list, not one section
  const sections = [
    { title: "Go to", rows: goToRows.filter(matches), offset: 0 },
    { title: "Actions", rows: actionRows.filter(matches), offset: 0 },
  ].filter((section) => section.rows.length > 0)
  for (let i = 1; i < sections.length; i++) {
    sections[i].offset = sections[i - 1].offset + sections[i - 1].rows.length
  }
  const rows = sections.flatMap((section) => section.rows)

  const select = async (row: PaletteRow) => {
    onOpenChange(false)
    if (row.kind === "goto") {
      navigate({ to: row.to })
    } else if (row.id === "new-drawing") {
      // The palette is list-only, never a form — both create rows close it
      // into the standard create dialog (spec §4.1)
      openCreateDrawingDialog()
    } else if (row.id === "new-folder") {
      openCreateFolderDialog()
    } else {
      await authClient.signOut()
      window.location.href = "/login"
    }
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
                ? `command-palette-row-${rows[activeIndex].id}`
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
                {section.rows.map((row, i) => {
                  const index = section.offset + i
                  const isActive = index === activeIndex
                  return (
                    <button
                      key={row.id}
                      id={`command-palette-row-${row.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
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
