import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { DrawingGallery } from "@/components/drawing-gallery/DrawingGallery"
import { IllustratedEmptyState } from "@/components/illustrated-empty-state"
import { KEYCAP_CLASS } from "@/components/ui/button"
import { useTrashDrawing } from "@/features/drawings/mutations"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { cn } from "@/lib/utils"
import { useCreateDialog } from "../CreateDialog"

const RECENT_LIMIT = 8

export function Home({ isAdmin }: { isAdmin: boolean }) {
  const { data: drawings = [], isPending } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog } = useCreateDialog()
  const trashDrawing = useTrashDrawing()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            Recent
          </h1>
          <div className="flex items-center gap-4">
            {/* Pointless next to the empty state — only offered once there is
                something to browse */}
            {drawings.length > 0 && (
              <Link
                to="/drawings"
                className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            )}
            <button
              type="button"
              onClick={() => openCreateDrawingDialog()}
              className={cn(
                KEYCAP_CLASS,
                "flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium",
              )}
            >
              <Plus className="h-3.5 w-3.5 text-iris" strokeWidth={2.5} />
              New drawing
            </button>
          </div>
        </div>

        <DrawingGallery
          drawings={drawings}
          folders={folders}
          isPending={isPending}
          limit={RECENT_LIMIT}
          loadingLabel="Loading recent drawings"
          onTrash={trashDrawing}
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
