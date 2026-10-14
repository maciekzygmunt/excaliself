import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import fuzzysort from "fuzzysort"
import {
  File,
  Folder,
  FolderX,
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
  useMemo,
  useState,
} from "react"
import { SpaceLabel } from "@/components/space-label"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import type { Space } from "@/db/schema"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { findInScene } from "@/features/drawings/search"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { useCreateDialog } from "./CreateDialog"

// A row inside a route-contributed context section. An onSelect row closes
// the palette first, then runs — the palette is list-only, so text entry and
// confirmations happen in the standard dialogs it closes into. A pickFolder
// row is the one nested flow (spec §4.1): it swaps the palette to a filterable
// folder list instead, and onPick fires with the chosen destination (null for
// the root) once the palette has closed.
export type PaletteContextRow = {
  id: string
  label: string
  icon: LucideIcon
  destructive?: boolean
} & (
  | { onSelect: () => void; pickFolder?: undefined }
  | { onSelect?: undefined; pickFolder: (folderId: string | null) => void }
)

// The palette's Context section (spec §4.1): rendered above Drawings and Go
// to, it exists only on the surfaces §5 lists — routes contribute it via
// usePaletteContextSection; everywhere else the palette shows globals only.
export type PaletteContextSection = {
  title: string
  rows: PaletteContextRow[]
}

// Sections render in the fixed order Context → Drawings → Go to → Actions
// (spec §4.1), never score-interleaved. Go to holds exactly these four static
// rows, joined by folder matches as dynamic rows while typing (never static);
// Actions exactly these three — no theme row, no invite actions.
type PaletteRow =
  | {
      kind: "goto"
      id: string
      label: string
      // Muted trailing text: why a drawing matched when it wasn't its title
      detail?: string
      // A drawing's space, labelled while Team is on
      space?: Space
      icon: LucideIcon
      to: string
      params?: { id: string }
    }
  | {
      kind: "action"
      id: "new-drawing" | "new-folder" | "sign-out"
      label: string
      icon: LucideIcon
    }
  | ({ kind: "context" } & PaletteContextRow)
  | {
      kind: "pick-folder"
      id: string
      label: string
      icon: LucideIcon
      folderId: string | null
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
  contextSection?: PaletteContextSection | null
}

export function CommandPalette({
  open,
  onOpenChange,
  contextSection,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const { openCreateDrawingDialog, openCreateFolderDialog } = useCreateDialog()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  // Non-null while the nested folder picker is showing (spec §4.1) — holds
  // the onPick of the context row that opened it
  const [folderPicker, setFolderPicker] = useState<{
    onPick: (folderId: string | null) => void
  } | null>(null)

  // The provider keeps this component mounted across opens — reset on every
  // open so the previous session's query or picker can't leak into the next
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setFolderPicker(null)
    }
  }, [open])

  // Swapping lists (typing, entering or leaving the picker) restarts the
  // selection at the top of a freshly scrolled list
  const resetList = () => {
    setActiveIndex(0)
    const list = document.getElementById("command-palette-list")
    if (list) list.scrollTop = 0
  }

  const { data: drawings } = useQuery(drawingsQueryOptions())
  const { data: folders } = useQuery(foldersQueryOptions())
  const { data: teamEnabled = false } = useQuery({
    ...currentUserQueryOptions(),
    select: (user) => user.teamEnabled,
  })

  // Fuzzy matching: "rdmap" finds "Roadmap". Static sections (Context, Go to,
  // Actions) only filter — their fixed order is muscle memory, so a score
  // must never reshuffle them. Dynamic lists (drawings, folders, the picker)
  // rank best match first via rankedByFuzzy.
  const q = query.trim()
  const matchesQuery = (label: string) =>
    q === "" || fuzzysort.single(q, label) !== null
  const matches = (row: PaletteRow) => matchesQuery(row.label)
  const rankedByFuzzy = <T,>(items: T[], name: (item: T) => string): T[] =>
    q === ""
      ? items
      : fuzzysort.go(q, items, { key: name }).map((result) => result.obj)

  const contextRows: PaletteRow[] = (contextSection?.rows ?? [])
    .filter((row) => matchesQuery(row.label))
    .map((row) => ({ kind: "context" as const, ...row }))

  // getDrawings already excludes trashed rows; filter again so a stale cache
  // write can never surface one (trash is found via Trash).
  const visibleDrawings = (drawings ?? []).filter((d) => d.deletedAt === null)

  // Empty input is the launcher: the 5 most recent drawings lead the list, so
  // ⌘K → Enter reopens the last-edited drawing from anywhere (spec §3.2).
  // Sorted here rather than trusting cache order, since only updatedAt defines
  // "most recent". Typing swaps the section to a fuzzy search over titles,
  // best match first, then drawings whose scene text contains the query.
  // Scene text is substring-only: fuzzy over a whole scene matches nearly
  // anything.
  const titleMatches =
    q === ""
      ? [...visibleDrawings]
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )
          .slice(0, 5)
      : rankedByFuzzy(visibleDrawings, (d) => d.name)
  const titleMatchIds = new Set(titleMatches.map((d) => d.id))
  const sceneMatches = visibleDrawings.flatMap((d) => {
    if (titleMatchIds.has(d.id)) return []
    const snippet = findInScene(d, q)
    return snippet === null ? [] : [{ drawing: d, snippet }]
  })
  const drawingRows: PaletteRow[] = [
    ...titleMatches.map((drawing) => ({ drawing, snippet: undefined })),
    ...sceneMatches,
  ].map(({ drawing: d, snippet }) => ({
    kind: "goto",
    id: `drawing-${d.id}`,
    label: d.name,
    detail: snippet,
    space: teamEnabled ? d.space : undefined,
    icon: File,
    to: "/draw/$id",
    params: { id: d.id },
  }))

  // Folders are never static Go to rows — they only appear while typing
  const folderRows: PaletteRow[] =
    q === ""
      ? []
      : rankedByFuzzy(folders ?? [], (f) => f.name).map((f) => ({
          kind: "goto",
          id: `folder-${f.id}`,
          label: f.name,
          icon: Folder,
          to: "/folder/$id",
          params: { id: f.id },
        }))

  // The nested picker replaces every section with one filterable folder list,
  // root first as "No folder" (spec §4.1) — ranked like any other row so
  // typing a folder name doesn't pin a barely-matched root above the matches
  const folderPickerRows: PaletteRow[] = rankedByFuzzy(
    [
      {
        kind: "pick-folder" as const,
        id: "move-root",
        label: "No folder",
        icon: FolderX,
        folderId: null,
      },
      ...(folders ?? []).map((f) => ({
        kind: "pick-folder" as const,
        id: `move-folder-${f.id}`,
        label: f.name,
        icon: Folder,
        folderId: f.id,
      })),
    ],
    (row) => row.label,
  )

  // Empty sections collapse; activeIndex runs across the remaining sections
  // so arrow keys walk the whole list, not one section
  const sections = (
    folderPicker
      ? [{ title: "Move to folder", rows: folderPickerRows, offset: 0 }]
      : [
          ...(contextSection
            ? [{ title: contextSection.title, rows: contextRows, offset: 0 }]
            : []),
          { title: "Drawings", rows: drawingRows, offset: 0 },
          {
            title: "Go to",
            rows: [...goToRows.filter(matches), ...folderRows],
            offset: 0,
          },
          { title: "Actions", rows: actionRows.filter(matches), offset: 0 },
        ]
  ).filter((section) => section.rows.length > 0)
  for (let i = 1; i < sections.length; i++) {
    sections[i].offset = sections[i - 1].offset + sections[i - 1].rows.length
  }
  const rows = sections.flatMap((section) => section.rows)

  const select = async (row: PaletteRow) => {
    if (row.kind === "context" && row.pickFolder) {
      // The one row that doesn't close the palette: swap to the picker with a
      // fresh query — the text that matched "Move to folder…" would otherwise
      // filter the folder list it just opened
      setFolderPicker({ onPick: row.pickFolder })
      setQuery("")
      resetList()
      return
    }
    onOpenChange(false)
    if (row.kind === "pick-folder") {
      folderPicker?.onPick(row.folderId)
    } else if (row.kind === "context") {
      row.onSelect()
    } else if (row.kind === "goto") {
      navigate({ to: row.to, params: row.params })
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

  // Keyboard moves must keep the active row visible in the scrollable list.
  // Only keyboard: scrolling on hover would yank the list under the cursor.
  // The rows are all rendered, so the target exists before React re-renders.
  const moveActive = (delta: number) => {
    if (!rows.length) return
    const next = (activeIndex + delta + rows.length) % rows.length
    setActiveIndex(next)
    document
      .getElementById(`command-palette-row-${rows[next].id}`)
      ?.scrollIntoView?.({ block: "nearest" })
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const row = rows[activeIndex]
      if (row) select(row)
    } else if (e.key === "Backspace" && folderPicker && query === "") {
      // Backspace with nothing left to delete steps out of the nested picker
      // back to the main list (spec §4.1); Esc still closes the palette
      e.preventDefault()
      setFolderPicker(null)
      resetList()
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
        {/* The sunken input well — the palette's place-to-type. */}
        <div className="flex items-center gap-2.5 rounded-md bg-well px-3 py-2.5 shadow-well m-2 mb-0">
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
              resetList()
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
            placeholder={folderPicker ? "Search folders…" : "Search…"}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Command palette results"
          className="scrollbar-subtle max-h-80 overflow-y-auto p-1.5"
        >
          {rows.length > 0 ? (
            sections.map((section) => (
              <Fragment key={section.title}>
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                  {section.title}
                </div>
                {section.rows.map((row, i) => {
                  const index = section.offset + i
                  const isActive = index === activeIndex
                  const destructive = row.kind === "context" && row.destructive
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
                        // scroll-my keeps keyboard scrollIntoView from
                        // flushing the row against the scrollport edge
                        "flex w-full scroll-my-1.5 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]",
                        destructive ? "text-destructive" : "text-foreground",
                        isActive && "bg-iris-muted",
                      )}
                    >
                      <row.icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          destructive
                            ? "text-destructive"
                            : isActive
                              ? "text-iris"
                              : "text-muted-foreground/40",
                        )}
                      />
                      <span className="truncate">{row.label}</span>
                      {row.kind === "goto" && row.detail && (
                        <span className="min-w-0 flex-1 truncate text-muted-foreground/70">
                          {row.detail}
                        </span>
                      )}
                      {row.kind === "goto" && row.space && (
                        <SpaceLabel
                          space={row.space}
                          className="ml-auto pl-2 text-[11px] text-muted-foreground/60"
                        />
                      )}
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
        <div className="flex items-center gap-3 border-t border-hairline bg-muted/40 px-4 py-2 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <Kbd className="h-4 min-w-4 text-[10px]">↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd className="h-4 min-w-4 text-[10px]">↵</Kbd> open
          </span>
          {folderPicker && (
            <span className="flex items-center gap-1">
              <Kbd className="h-4 min-w-4 text-[10px]">⌫</Kbd> back
            </span>
          )}
          <span className="flex items-center gap-1">
            <Kbd className="h-4 min-w-4 text-[10px]">esc</Kbd> close
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
 * section renders above Drawings and Go to while the caller stays mounted and
 * unregisters when it unmounts or passes null. Pass a memoized section — a
 * fresh object every render re-registers needlessly.
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
