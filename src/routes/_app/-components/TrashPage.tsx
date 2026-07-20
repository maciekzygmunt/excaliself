import { useQuery } from "@tanstack/react-query"
import { QuietLine } from "@/components/drawing-gallery/GalleryEmpty"
import { TrashGallery } from "@/components/drawing-gallery/TrashGallery"
import {
  useRestoreTrashedDrawing,
  useRestoreTrashedFolder,
} from "@/features/trash/mutations"
import { trashQueryOptions } from "@/features/trash/queries"
import { useDocumentTitle } from "@/lib/document-title"

// The trash surface (spec §5.11): the gallery grid in trash mode, owner-
// scoped. No toolbar — trash is a holding pen, not a browse surface.
export function TrashPage() {
  const { data, isPending } = useQuery(trashQueryOptions())
  const restoreDrawing = useRestoreTrashedDrawing()
  const restoreFolder = useRestoreTrashedFolder()
  useDocumentTitle("Trash", { chrome: true })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            Trash
          </h1>
        </div>

        <TrashGallery
          drawings={data?.drawings ?? []}
          folders={data?.folders ?? []}
          isPending={isPending}
          loadingLabel="Loading trash"
          onRestoreDrawing={restoreDrawing}
          onRestoreFolder={restoreFolder}
          empty={
            // Tier-2 quiet line doubling as the retention disclosure —
            // no CTA, no illustration (spec §5.10).
            <QuietLine>
              Nothing in trash. Deleted drawings stay here for 30 days before
              being removed forever.
            </QuietLine>
          }
        />
      </div>
    </div>
  )
}
