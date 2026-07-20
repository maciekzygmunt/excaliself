import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { DrawingGallery } from "@/components/drawing-gallery/DrawingGallery"
import { IllustratedEmptyState } from "@/components/illustrated-empty-state"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useCreateDialog } from "../CreateDialog"

const RECENT_LIMIT = 8

export function Home({ isAdmin }: { isAdmin: boolean }) {
  const { data: drawings = [], isPending } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog } = useCreateDialog()

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
              className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_2px_5px_rgba(20,20,45,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] active:scale-[0.98] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
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
