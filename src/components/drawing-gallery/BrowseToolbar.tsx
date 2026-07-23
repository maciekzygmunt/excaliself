import { ArrowUpDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Folder } from "@/features/folders/queries"
import { cn } from "@/lib/utils"
import {
  type GalleryScope,
  SORT_LABELS,
  SORT_ORDERS,
  type SortOrder,
  scopedFolderId,
} from "./browse"

/**
 * The gallery toolbar (spec §5.2): on-page search — the app's only inline
 * filter — a folder-chip row, and a sort dropdown. Browse passes `chips`
 * for the chip row; the folder page reuses the toolbar without it.
 */
export function BrowseToolbar({
  query,
  onQueryChange,
  chips,
  sort,
  onSortChange,
}: {
  query: string
  onQueryChange: (query: string) => void
  /** When present with folders, renders the All / per-folder / Unfiled chips. */
  chips?: {
    folders: Folder[]
    scope: GalleryScope
    onScopeChange: (scope: GalleryScope) => void
  }
  sort: SortOrder
  onSortChange: (sort: SortOrder) => void
}) {
  const sortLabel = SORT_LABELS[sort]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search drawings…"
            aria-label="Search drawings"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Sort: ${sortLabel}`}
                className="ml-auto text-muted-foreground hover:text-foreground"
              />
            }
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortLabel}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => onSortChange(value as SortOrder)}
            >
              {SORT_ORDERS.map((order) => (
                // closeOnClick: Base UI radio items keep the menu open by
                // default; picking a sort order should dismiss it
                <DropdownMenuRadioItem key={order} value={order} closeOnClick>
                  {SORT_LABELS[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {chips && chips.folders.length > 0 && (
        <div
          role="group"
          aria-label="Filter by folder"
          className="flex flex-wrap gap-1.5"
        >
          <FolderChip
            label="All"
            selected={chips.scope === "all"}
            onClick={() => chips.onScopeChange("all")}
          />
          {chips.folders.map((folder) => (
            <FolderChip
              key={folder.id}
              label={folder.name}
              selected={scopedFolderId(chips.scope) === folder.id}
              onClick={() => chips.onScopeChange({ folderId: folder.id })}
            />
          ))}
          <FolderChip
            label="Unfiled"
            selected={chips.scope === "unfiled"}
            onClick={() => chips.onScopeChange("unfiled")}
          />
        </div>
      )}
    </div>
  )
}

function FolderChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-7 max-w-[12rem] truncate rounded-full border px-3 text-[13px] font-medium transition-[color,border-color,background-color,scale] duration-150 outline-none focus-visible:ring-[2px] focus-visible:ring-ring/30 active:scale-[0.98]",
        selected
          ? "border-transparent bg-iris-muted text-iris-strong shadow-row-active"
          : "border-border/80 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}
