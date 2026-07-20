import { Folder as FolderIcon } from "lucide-react"
import { useMemo } from "react"
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
 * a contents count, never dispersed children — and the card action is
 * Restore. Cards don't link anywhere; nothing in trash is editable.
 */
export function TrashGallery({
  drawings,
  folders,
  isPending,
  loadingLabel,
  onRestoreDrawing,
  onRestoreFolder,
  empty,
}: {
  drawings: TrashedDrawing[]
  folders: TrashedFolder[]
  isPending: boolean
  /** Accessible name for the loading grid. */
  loadingLabel: string
  onRestoreDrawing: (drawing: TrashedDrawing) => void
  onRestoreFolder: (folder: TrashedFolder) => void
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
          />
        ) : (
          <TrashedDrawingCard
            key={unit.drawing.id}
            drawing={unit.drawing}
            onRestore={() => onRestoreDrawing(unit.drawing)}
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
}: {
  drawing: TrashedDrawing
  onRestore: () => void
}) {
  return (
    <div className={CARD_FRAME_CLASS}>
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
      />
    </div>
  )
}

function TrashedFolderCard({
  folder,
  onRestore,
}: {
  folder: TrashedFolder
  onRestore: () => void
}) {
  const count = folder.itemCount === 1 ? "1 item" : `${folder.itemCount} items`
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
      />
    </div>
  )
}

function CardFooter({
  name,
  meta,
  restoreLabel,
  onRestore,
}: {
  name: string
  meta: React.ReactNode
  restoreLabel: string
  onRestore: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-foreground">
          {name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </div>
      <button
        type="button"
        aria-label={restoreLabel}
        onClick={onRestore}
        className="-mr-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-iris transition-colors duration-150 hover:bg-iris-muted hover:text-iris-strong focus-visible:bg-iris-muted focus-visible:outline-none"
      >
        Restore
      </button>
    </div>
  )
}
