import { useQuery } from "@tanstack/react-query"
import { DrawingGallery } from "@/components/drawing-gallery/DrawingGallery"
import { IllustratedEmptyState } from "@/components/illustrated-empty-state"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { useCreateDialog } from "./CreateDialog"

// The browse surface: every drawing the user owns, in Home's card language.
// The toolbar (on-page search, folder chips, sort) is a follow-up ticket.
export function AllDrawings({ isAdmin }: { isAdmin: boolean }) {
  const { data: drawings = [], isPending } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog } = useCreateDialog()
  useDocumentTitle("All drawings", { chrome: true })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            All drawings
          </h1>
        </div>

        <DrawingGallery
          drawings={drawings}
          folders={folders}
          isPending={isPending}
          loadingLabel="Loading drawings"
          empty={
            <IllustratedEmptyState
              isAdmin={isAdmin}
              onCreate={openCreateDrawingDialog}
            />
          }
        />
      </div>
    </div>
  )
}
