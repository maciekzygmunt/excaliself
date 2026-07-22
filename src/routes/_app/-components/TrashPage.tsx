import { useQuery } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { DangerConfirmDialog } from "@/components/danger-confirm-dialog"
import { QuietLine } from "@/components/drawing-gallery/GalleryEmpty"
import { TrashGallery } from "@/components/drawing-gallery/TrashGallery"
import { Button } from "@/components/ui/button"
import { describeContents } from "@/features/trash/destroy-copy"
import {
  useDeleteTrashUnitForever,
  useEmptyTrash,
  useRestoreTrashedDrawing,
  useRestoreTrashedFolder,
} from "@/features/trash/mutations"
import { trashQueryOptions } from "@/features/trash/queries"
import { useDocumentTitle } from "@/lib/document-title"
import {
  type PaletteContextSection,
  usePaletteContextSection,
} from "./CommandPalette"

// The trash surface (spec §5.11): the gallery grid in trash mode, owner-
// scoped. No toolbar — trash is a holding pen, not a browse surface.
export function TrashPage() {
  const { data, isPending } = useQuery(trashQueryOptions())
  const restoreDrawing = useRestoreTrashedDrawing()
  const restoreFolder = useRestoreTrashedFolder()
  const deleteForever = useDeleteTrashUnitForever()
  const emptyTrash = useEmptyTrash()
  useDocumentTitle("Trash", { chrome: true })

  const hasUnits =
    (data?.drawings.length ?? 0) + (data?.folders.length ?? 0) > 0

  // The palette's context section here is a single row that closes into the
  // header's count-aware danger dialog — same instance, so palette and
  // header can never drift (spec §5.11); absent when trash is empty, like
  // the header button.
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const section = useMemo<PaletteContextSection | null>(() => {
    if (!hasUnits) return null
    return {
      title: "Trash",
      rows: [
        {
          id: "trash:empty",
          label: "Empty trash",
          icon: Trash2,
          destructive: true,
          onSelect: () => setEmptyTrashOpen(true),
        },
      ],
    }
  }, [hasUnits])
  usePaletteContextSection(section)
  // Every row Empty trash would destroy, subtree members included —
  // the count-aware phrasing for the tier-2 dialog (spec §4.5).
  const totalsPhrase = data
    ? describeContents(data.totals.drawings, data.totals.folders)
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            Trash
          </h1>
          {/* Absent (not disabled) when trash is empty — spec §5.11 */}
          {hasUnits && totalsPhrase && (
            <DangerConfirmDialog
              open={emptyTrashOpen}
              onOpenChange={setEmptyTrashOpen}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  Empty trash
                </Button>
              }
              title="Empty trash?"
              description={`This will permanently delete ${totalsPhrase}. This can't be undone.`}
              confirmLabel="Empty trash"
              pendingLabel="Emptying…"
              onConfirm={emptyTrash}
            />
          )}
        </div>

        <TrashGallery
          drawings={data?.drawings ?? []}
          folders={data?.folders ?? []}
          isPending={isPending}
          loadingLabel="Loading trash"
          onRestoreDrawing={restoreDrawing}
          onRestoreFolder={restoreFolder}
          onDeleteForever={deleteForever}
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
