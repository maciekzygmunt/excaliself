import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { BrowseToolbar } from "@/components/drawing-gallery/BrowseToolbar"
import {
  DEFAULT_SORT,
  filterDrawings,
  type GalleryScope,
  type SortOrder,
  scopedFolderId,
} from "@/components/drawing-gallery/browse"
import { DrawingGallery } from "@/components/drawing-gallery/DrawingGallery"
import { IllustratedEmptyState } from "@/components/illustrated-empty-state"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import type { Folder } from "@/features/folders/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { useCreateDialog } from "./CreateDialog"

// The browse surface: every drawing the user owns, in Home's card language,
// under the toolbar (on-page search, folder chips, sort — spec §5.2).
export function AllDrawings({ isAdmin }: { isAdmin: boolean }) {
  const { data: drawings = [], isPending } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog } = useCreateDialog()
  useDocumentTitle("All drawings", { chrome: true })

  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<GalleryScope>("all")
  const [sort, setSort] = useState<SortOrder>(DEFAULT_SORT)

  const filtered = useMemo(
    () => filterDrawings(drawings, { query, scope }),
    [drawings, query, scope],
  )

  // Tier-1 is reserved for a truly empty account; a grid emptied by the
  // toolbar's filters gets the quiet tier-2 line instead (spec §5.10).
  const hasAnyDrawings = drawings.length > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            All drawings
          </h1>
        </div>

        {hasAnyDrawings && (
          <div className="pb-5">
            <BrowseToolbar
              query={query}
              onQueryChange={setQuery}
              folders={folders}
              scope={scope}
              onScopeChange={setScope}
              sort={sort}
              onSortChange={setSort}
            />
          </div>
        )}

        <DrawingGallery
          drawings={filtered}
          // Attribution only in the All view — a scoped grid repeats one folder
          folders={scope === "all" ? folders : undefined}
          isPending={isPending}
          sort={sort}
          loadingLabel="Loading drawings"
          empty={
            hasAnyDrawings ? (
              <FilteredEmpty
                query={query}
                scope={scope}
                folders={folders}
                onCreateInFolder={(folder) =>
                  openCreateDrawingDialog({ id: folder.id, name: folder.name })
                }
              />
            ) : (
              <IllustratedEmptyState
                isAdmin={isAdmin}
                onCreate={openCreateDrawingDialog}
              />
            )
          }
        />
      </div>
    </div>
  )
}

// Tier-2 empty state: one quiet line + contextual action, no illustration
// (spec §5.10).
function FilteredEmpty({
  query,
  scope,
  folders,
  onCreateInFolder,
}: {
  query: string
  scope: GalleryScope
  folders: Folder[]
  onCreateInFolder: (folder: Folder) => void
}) {
  const trimmed = query.trim()
  if (trimmed !== "") {
    return <QuietLine>No drawings match “{trimmed}”</QuietLine>
  }
  if (scope === "unfiled") {
    return <QuietLine>No unfiled drawings</QuietLine>
  }

  const folder = folders.find((f) => f.id === scopedFolderId(scope))
  return (
    <div className="flex flex-col items-center py-16">
      <p className="text-sm text-muted-foreground">This folder is empty</p>
      {folder && (
        <button
          type="button"
          onClick={() => onCreateInFolder(folder)}
          className="mt-3 text-[13px] font-medium text-iris transition-colors duration-150 hover:text-iris-strong"
        >
          New drawing here
        </button>
      )}
    </div>
  )
}

function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
