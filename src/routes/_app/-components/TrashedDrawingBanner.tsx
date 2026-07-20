import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { DangerConfirmDialog } from "@/components/danger-confirm-dialog"
import { Button } from "@/components/ui/button"
import { describeContents } from "@/features/trash/destroy-copy"
import {
  useDeleteTrashUnitForever,
  useRestoreTrashedDrawing,
} from "@/features/trash/mutations"
import { trashQueryOptions } from "@/features/trash/queries"
import { daysUntilPurge } from "@/features/trash/retention"

type TrashedDrawingInfo = {
  id: string
  name: string
  deletedAt: Date | string
  trashRootId: string | null
}

function purgeSentence(deletedAt: Date | string): string {
  const days = daysUntilPurge(deletedAt)
  if (days <= 0) return "This drawing will be permanently deleted today."
  if (days === 1) return "This drawing will be permanently deleted in 1 day."
  return `This drawing will be permanently deleted in ${days} days.`
}

/**
 * The banner over a trashed drawing's read-only canvas (spec §5.11): states
 * the purge countdown and offers Restore / Delete forever. Restore follows
 * the standard restore rules (optimistic; the detail query invalidation
 * flips the canvas back to editable). Delete forever is confirm-gated by the
 * tier-2 count-aware danger dialog and navigates Home on success.
 */
export function TrashedDrawingBanner({
  drawing,
}: {
  drawing: TrashedDrawingInfo
}) {
  const navigate = useNavigate()
  const restoreDrawing = useRestoreTrashedDrawing()
  const deleteForever = useDeleteTrashUnitForever()

  // Delete forever destroys the whole trash *unit* (spec §5.11) — for a
  // drawing swept along by a folder trashing that's the folder subtree, so
  // the danger copy must say so with counts (spec §4.5). The unit's counts
  // live on the trash page's query; only fetched when actually needed.
  const unitId = drawing.trashRootId ?? drawing.id
  const isFolderUnit = unitId !== drawing.id
  const { data: trashItems, isPending: trashPending } = useQuery({
    ...trashQueryOptions(),
    enabled: isFolderUnit,
  })
  // A direct link to a folder-swept drawing can race the counts fetch: block
  // confirmation until it settles so the dialog is count-aware (spec §4.5).
  // If the fetch errors out (isPending goes false, no data), the generic
  // everything-inside copy below still warns and confirm unblocks — the
  // counts query mustn't be able to wedge Delete forever shut.
  const countsLoading = isFolderUnit && trashPending

  let description = `"${drawing.name}" will be permanently deleted. This can't be undone.`
  if (isFolderUnit) {
    const unitFolder = trashItems?.folders.find((f) => f.id === unitId)
    const contents = unitFolder
      ? describeContents(
          unitFolder.drawingCount,
          unitFolder.itemCount - unitFolder.drawingCount,
        )
      : null
    description =
      unitFolder && contents
        ? `This drawing was trashed with its folder. "${unitFolder.name}" and the ${contents} inside will be permanently deleted. This can't be undone.`
        : "This drawing was trashed with its folder, which will be permanently deleted along with everything inside. This can't be undone."
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-destructive/15 bg-destructive/5 px-4 py-2.5"
    >
      <span className="inline-flex items-center gap-2 text-[13px] text-foreground">
        <Trash2 aria-hidden className="h-3.5 w-3.5 text-destructive/70" />
        {purgeSentence(drawing.deletedAt)}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-iris hover:text-iris-strong"
          onClick={() => restoreDrawing(drawing)}
        >
          Restore
        </Button>
        <DangerConfirmDialog
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              Delete forever…
            </Button>
          }
          title="Delete forever?"
          description={description}
          confirmLabel="Delete forever"
          pendingLabel="Deleting…"
          confirmDisabled={countsLoading}
          onConfirm={async () => {
            await deleteForever(unitId)
            // The drawing no longer exists — Home, not a dead canvas URL.
            navigate({ to: "/draw", replace: true })
          }}
        />
      </span>
    </div>
  )
}
