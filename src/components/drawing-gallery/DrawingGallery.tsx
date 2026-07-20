import { Link } from "@tanstack/react-router"
import {
  Folder as FolderIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import type { Drawing } from "@/features/drawings/queries"
import type { Folder } from "@/features/folders/queries"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { cn } from "@/lib/utils"
import { compareDrawings, DEFAULT_SORT, type SortOrder } from "./browse"

// Shared with TrashGallery so browse and trash stay one grid language.
export const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4"

/** The card's resting frame; interactive cards layer hover/active on top. */
export const CARD_FRAME_CLASS =
  "relative flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"

const DEFAULT_SKELETON_COUNT = 8

function formatEditedAgo(updatedAt: Date | string): string {
  const minutes = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / 60_000,
  )
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  // 30-day months drift past the calendar: days 360-364 are under a year but
  // floor to 12 — cap at 11mo so it never reads "12mo ago" or "0y ago"
  if (days < 365) return `${Math.min(Math.floor(days / 30), 11)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/**
 * The app's one drawing grid: preview cards sorted newest-edited first, with
 * a delayed skeleton while loading and an `empty` slot for the zero state.
 * Home caps it with `limit`; browse renders it whole; trash will reuse it.
 */
export function DrawingGallery({
  drawings,
  folders,
  isPending,
  limit,
  sort = DEFAULT_SORT,
  loadingLabel,
  onTrash,
  empty,
}: {
  /** Any order — the server sorts, but autosave patches cache rows in place
   * without reordering, so the gallery sorts for itself. */
  drawings: Drawing[]
  /** When provided, cards carry folder attribution (Home and the All view —
   * scoped views omit it). */
  folders?: Folder[]
  isPending: boolean
  /** Cap applied after sorting (Home's 8 recents). */
  limit?: number
  /** Grid order — browse's sort dropdown; everywhere else keeps Recent. */
  sort?: SortOrder
  /** Accessible name for the loading grid. */
  loadingLabel: string
  /** Card overflow action "Move to trash" (spec §5.11): tier-1 destructive,
   * identical everywhere — pages wire `useTrashDrawing`, which removes the
   * card optimistically and shows the undo toast itself. No confirm dialog. */
  onTrash: (drawing: Drawing) => void
  /** Rendered when loading settles on zero drawings. */
  empty: React.ReactNode
}) {
  // Spec §4.3: skeletons appear only after ~150 ms — cache hits render
  // instantly, and loads that beat the grace period never flash one.
  const showSkeleton = useDelayedVisible(isPending)

  const sorted = useMemo(() => {
    const ordered = [...drawings].sort(compareDrawings(sort))
    return limit === undefined ? ordered : ordered.slice(0, limit)
  }, [drawings, limit, sort])

  const foldersById = useMemo(
    () => new Map((folders ?? []).map((folder) => [folder.id, folder])),
    [folders],
  )

  if (isPending) {
    return showSkeleton ? (
      <LoadingGrid
        label={loadingLabel}
        count={limit ?? DEFAULT_SKELETON_COUNT}
      />
    ) : null
  }

  if (sorted.length === 0) return <>{empty}</>

  return (
    // Mount fade so the swap from skeletons isn't a single-frame pop.
    // Reduced-motion keeps it: opacity-only is already the gentle form.
    <div className={cn(GRID_CLASS, "animate-in fade-in-0 duration-200")}>
      {sorted.map((drawing) => (
        <DrawingCard
          key={drawing.id}
          drawing={drawing}
          folder={
            drawing.folderId ? foldersById.get(drawing.folderId) : undefined
          }
          onTrash={() => onTrash(drawing)}
        />
      ))}
    </div>
  )
}

// Placeholder cards mirror DrawingCard's frame so the loaded grid lands on
// the same footprint instead of popping into empty space.
export function LoadingGrid({
  label,
  count,
}: {
  label: string
  count: number
}) {
  return (
    <div role="status" aria-label={label} className={GRID_CLASS}>
      {Array.from({ length: count }, (_, i) => (
        <div
          // Static list — index keys are fine
          key={i}
          className="flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
        >
          <Skeleton className="aspect-[4/3] rounded-none border-b border-border/60 motion-reduce:animate-none" />
          <div className="flex flex-col gap-1.5 px-3 py-2.5">
            <Skeleton className="h-3.5 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-16 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Anchors can't nest, and the attribution chip is itself a link to the
// folder page (spec §5.3) — so the card is a div with a stretched link to
// the drawing, and the chip sits above it on its own z-layer.
function DrawingCard({
  drawing,
  folder,
  onTrash,
}: {
  drawing: Drawing
  folder?: Folder
  onTrash: () => void
}) {
  return (
    <div
      className={cn(
        CARD_FRAME_CLASS,
        "group transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_3px_8px_rgba(20,20,45,0.1)] active:scale-[0.99] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]",
      )}
    >
      <Link
        to="/draw/$id"
        params={{ id: drawing.id }}
        aria-label={drawing.name}
        className="absolute inset-0 rounded-xl"
      />
      <div className="aspect-[4/3] overflow-hidden border-b border-border/60">
        <Preview name={drawing.name} data={drawing.data} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {drawing.name}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {folder && (
              <>
                <Link
                  to="/folder/$id"
                  params={{ id: folder.id }}
                  className="relative z-10 flex min-w-0 items-center gap-1 transition-colors duration-150 hover:text-foreground"
                >
                  <FolderIcon className="h-3 w-3 shrink-0 fill-iris/70 text-iris" />
                  <span className="truncate">{folder.name}</span>
                </Link>
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
              </>
            )}
            {/* Server and client can straddle a minute boundary */}
            <span suppressHydrationWarning className="shrink-0">
              {formatEditedAgo(drawing.updatedAt)}
            </span>
          </span>
        </div>
        <CardActions name={drawing.name} onTrash={onTrash} />
      </div>
    </div>
  )
}

// The card's overflow menu — z-layered above the stretched drawing link,
// hidden until hover/focus on pointer devices (always visible on touch,
// which has no hover to reveal it).
function CardActions({ name, onTrash }: { name: string; onTrash: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${name}`}
          className="relative z-10 -mr-1.5 shrink-0 rounded-md p-1 text-muted-foreground/50 transition-[color,background-color,opacity] duration-150 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={onTrash}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Preview({ name, data }: { name: string; data: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"pending" | "ready" | "empty">("pending")

  useEffect(() => {
    let cancelled = false
    // Dynamic import: @excalidraw/excalidraw is not server-safe, and this
    // keeps it out of the SSR bundle and the gallery's initial chunk
    import("./preview")
      .then(({ renderPreviewSvg }) => renderPreviewSvg(data))
      .then((svg) => {
        if (cancelled) return
        if (!svg || !containerRef.current) {
          setState("empty")
          return
        }
        svg.style.width = "100%"
        svg.style.height = "100%"
        containerRef.current.replaceChildren(svg)
        setState("ready")
      })
      // A failed render is contained to this card's placeholder
      .catch(() => {
        if (!cancelled) setState("empty")
      })
    return () => {
      cancelled = true
    }
  }, [data])

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        role="img"
        aria-label={state === "ready" ? `Preview of ${name}` : undefined}
        // Reduced-motion keeps the fade: opacity-only is already the gentle form
        className={cn(
          "h-full w-full p-2 transition-opacity duration-200 ease-out [&_svg]:h-full [&_svg]:w-full [&_svg]:object-contain",
          state === "ready" ? "opacity-100" : "opacity-0",
        )}
      />
      {state === "empty" && (
        <div
          role="img"
          aria-label="No preview"
          className="absolute inset-0 flex items-center justify-center"
        >
          <Pencil className="h-5 w-5 text-muted-foreground/30" />
        </div>
      )}
    </div>
  )
}
