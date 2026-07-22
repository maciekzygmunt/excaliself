import { Link } from "@tanstack/react-router"
import { Folder as FolderIcon, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { DangerConfirmDialog } from "@/components/danger-confirm-dialog"
import { describeContents } from "@/features/trash/destroy-copy"
import type { TrashedDrawing, TrashedFolder } from "@/features/trash/queries"
import { purgeCountdownLabel } from "@/features/trash/retention"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { cn } from "@/lib/utils"
import {
  CARD_FRAME_CLASS,
  GRID_CLASS,
  LoadingGrid,
  Preview,
} from "./DrawingGallery"

const DEFAULT_SKELETON_COUNT = 8

/**
 * The gallery grid in trash mode (spec §5.11): the same card language as
 * browse, but units instead of drawings — a trashed folder is one card with
 * a contents count, never dispersed children — and the card actions are
 * Restore / Delete forever. Drawing cards open the read-only trashed view
 * at /draw/$id; folder cards don't link anywhere.
 */
export function TrashGallery({
  drawings,
  folders,
  isPending,
  loadingLabel,
  onRestoreDrawing,
  onRestoreFolder,
  onDeleteForever,
  empty,
}: {
  drawings: TrashedDrawing[]
  folders: TrashedFolder[]
  isPending: boolean
  /** Accessible name for the loading grid. */
  loadingLabel: string
  onRestoreDrawing: (drawing: TrashedDrawing) => void
  onRestoreFolder: (folder: TrashedFolder) => void
  /**
   * Hard-deletes one trash unit by its root id. Pessimistic (spec §4.3) —
   * the card's danger dialog awaits this with an in-button pending state.
   */
  onDeleteForever: (unitId: string) => Promise<unknown>
  /** Rendered when loading settles on an empty trash. */
  empty: React.ReactNode
}) {
  // Spec §4.3: the delayed-skeleton standard, same as the browse grid.
  const showSkeleton = useDelayedVisible(isPending)

  // Most recently trashed first — the thing you just deleted is on top.
  const units = useMemo(() => {
    const merged: TrashUnit[] = [
      ...folders.map((folder) => ({
        kind: "folder" as const,
        deletedAt: folder.deletedAt,
        folder,
      })),
      ...drawings.map((drawing) => ({
        kind: "drawing" as const,
        deletedAt: drawing.deletedAt,
        drawing,
      })),
    ]
    return merged.sort((a, b) => trashedAt(b) - trashedAt(a))
  }, [drawings, folders])

  if (isPending) {
    return showSkeleton ? (
      <LoadingGrid label={loadingLabel} count={DEFAULT_SKELETON_COUNT} />
    ) : null
  }

  if (units.length === 0) return <>{empty}</>

  return (
    // Mount fade mirrors DrawingGallery — no single-frame pop after skeletons.
    <div className={cn(GRID_CLASS, "animate-in fade-in-0 duration-200")}>
      {units.map((unit) =>
        unit.kind === "folder" ? (
          <TrashedFolderCard
            key={unit.folder.id}
            folder={unit.folder}
            onRestore={() => onRestoreFolder(unit.folder)}
            onDeleteForever={() => onDeleteForever(unit.folder.id)}
          />
        ) : (
          <TrashedDrawingCard
            key={unit.drawing.id}
            drawing={unit.drawing}
            onRestore={() => onRestoreDrawing(unit.drawing)}
            onDeleteForever={() => onDeleteForever(unit.drawing.id)}
          />
        ),
      )}
    </div>
  )
}

type TrashUnit =
  | { kind: "folder"; deletedAt: Date | null; folder: TrashedFolder }
  | { kind: "drawing"; deletedAt: Date | null; drawing: TrashedDrawing }

function trashedAt(unit: TrashUnit): number {
  return unit.deletedAt ? new Date(unit.deletedAt).getTime() : 0
}

function TrashedDrawingCard({
  drawing,
  onRestore,
  onDeleteForever,
}: {
  drawing: TrashedDrawing
  onRestore: () => void
  onDeleteForever: () => Promise<unknown>
}) {
  return (
    // Same stretched-link shape as DrawingCard: the whole card opens the
    // drawing's read-only trashed view, footer actions layer above on z-10.
    <div
      className={cn(
        CARD_FRAME_CLASS,
        "transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_3px_8px_rgba(20,20,45,0.1)] active:scale-[0.99] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]",
      )}
    >
      <Link
        to="/draw/$id"
        params={{ id: drawing.id }}
        aria-label={`View ${drawing.name}`}
        className="absolute inset-0 rounded-xl"
      />
      <div className="aspect-[4/3] overflow-hidden border-b border-border/60">
        <Preview name={drawing.name} data={drawing.data} />
      </div>
      <CardFooter
        name={drawing.name}
        meta={
          // Server and client can straddle a day boundary
          <span suppressHydrationWarning>
            {drawing.deletedAt ? purgeCountdownLabel(drawing.deletedAt) : null}
          </span>
        }
        restoreLabel={`Restore ${drawing.name}`}
        onRestore={onRestore}
        deleteDialog={
          <DangerConfirmDialog
            trigger={<DeleteForeverTrigger label={drawing.name} />}
            title="Delete forever?"
            description={`"${drawing.name}" will be permanently deleted. This can't be undone.`}
            confirmLabel="Delete forever"
            pendingLabel="Deleting…"
            onConfirm={onDeleteForever}
          />
        }
      />
    </div>
  )
}

function TrashedFolderCard({
  folder,
  onRestore,
  onDeleteForever,
}: {
  folder: TrashedFolder
  onRestore: () => void
  onDeleteForever: () => Promise<unknown>
}) {
  const count = folder.itemCount === 1 ? "1 item" : `${folder.itemCount} items`
  // Count-aware danger copy (spec §4.5): "…and the 8 drawings inside".
  // itemCount minus the drawings slice is the swept subfolders.
  const contents = describeContents(
    folder.drawingCount,
    folder.itemCount - folder.drawingCount,
  )
  return (
    <div className={CARD_FRAME_CLASS}>
      <div className="flex aspect-[4/3] items-center justify-center border-b border-border/60">
        <FolderIcon
          className="h-9 w-9 fill-iris/15 text-iris/60"
          strokeWidth={1.25}
        />
      </div>
      <CardFooter
        name={folder.name}
        meta={
          <>
            {count}
            {folder.deletedAt && (
              <>
                <span aria-hidden className="text-muted-foreground/50">
                  {" · "}
                </span>
                <span suppressHydrationWarning>
                  {purgeCountdownLabel(folder.deletedAt)}
                </span>
              </>
            )}
          </>
        }
        restoreLabel={`Restore ${folder.name}`}
        onRestore={onRestore}
        deleteDialog={
          <DangerConfirmDialog
            trigger={<DeleteForeverTrigger label={folder.name} />}
            title="Delete forever?"
            description={
              contents
                ? `"${folder.name}" and the ${contents} inside will be permanently deleted. This can't be undone.`
                : `"${folder.name}" will be permanently deleted. This can't be undone.`
            }
            confirmLabel="Delete forever"
            pendingLabel="Deleting…"
            onConfirm={onDeleteForever}
          />
        }
      />
    </div>
  )
}

/** Card-footer trigger for the per-unit Delete forever dialog. */
function DeleteForeverTrigger({
  label,
  ...props
}: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={`Delete forever ${label}`}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground/40 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none"
      {...props}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function CardFooter({
  name,
  meta,
  restoreLabel,
  onRestore,
  deleteDialog,
}: {
  name: string
  meta: React.ReactNode
  restoreLabel: string
  onRestore: () => void
  deleteDialog: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-foreground">
          {name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </div>
      {/* z-10 keeps Restore / Delete forever clickable above the drawing
          card's stretched link (no-op for folder cards, which don't link). */}
      <div className="relative z-10 -mr-1 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={restoreLabel}
          onClick={onRestore}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-iris transition-colors duration-150 hover:bg-iris-muted hover:text-iris-strong focus-visible:bg-iris-muted focus-visible:outline-none"
        >
          Restore
        </button>
        {deleteDialog}
      </div>
    </div>
  )
}
