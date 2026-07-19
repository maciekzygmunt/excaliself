import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Folder, Pencil, Plus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { type Drawing, drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { cn } from "@/lib/utils"
import { useCreateDialog } from "../CreateDialog"
import { renderPreviewSvg } from "./preview"

const RECENT_LIMIT = 8

// The server returns drawings newest-first, but autosave patches rows in the
// cache without reordering — Home sorts for itself.
function selectRecent(drawings: Drawing[]): Drawing[] {
  return [...drawings]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, RECENT_LIMIT)
}

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

export function Home() {
  const { data: drawings = [] } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog } = useCreateDialog()

  const recent = useMemo(() => selectRecent(drawings), [drawings])
  const folderNamesById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            Recent
          </h1>
          <button
            type="button"
            onClick={() => openCreateDrawingDialog()}
            className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_2px_5px_rgba(20,20,45,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] active:scale-[0.98] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          >
            <Plus className="h-3.5 w-3.5 text-iris" strokeWidth={2.5} />
            New drawing
          </button>
        </div>

        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {recent.map((drawing) => (
              <RecentCard
                key={drawing.id}
                drawing={drawing}
                folderName={
                  drawing.folderId
                    ? folderNamesById.get(drawing.folderId)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RecentCard({
  drawing,
  folderName,
}: {
  drawing: Drawing
  folderName?: string
}) {
  return (
    <Link
      to="/draw/$id"
      params={{ id: drawing.id }}
      className="group flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_3px_8px_rgba(20,20,45,0.1)] active:scale-[0.99] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
    >
      <div className="aspect-[4/3] overflow-hidden border-b border-border/60">
        <Preview name={drawing.name} data={drawing.data} />
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-[13px] font-medium text-foreground">
          {drawing.name}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {folderName && (
            <>
              <Folder className="h-3 w-3 shrink-0 fill-iris/70 text-iris" />
              <span className="truncate">{folderName}</span>
              <span aria-hidden className="text-muted-foreground/50">
                ·
              </span>
            </>
          )}
          <span className="shrink-0">{formatEditedAgo(drawing.updatedAt)}</span>
        </span>
      </div>
    </Link>
  )
}

function Preview({ name, data }: { name: string; data: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"pending" | "ready" | "empty">("pending")

  useEffect(() => {
    let cancelled = false
    renderPreviewSvg(data)
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

function EmptyState() {
  const { openCreateDrawingDialog } = useCreateDialog()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-16 text-center">
      <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-iris-muted shadow-[inset_0_0_0_1px_var(--iris-ring)]">
        <Pencil className="h-4.5 w-4.5 text-iris" />
      </div>
      <span className="text-sm font-medium text-foreground">
        No drawings yet
      </span>
      <p className="max-w-60 text-[13px] text-muted-foreground">
        Your recent drawings will show up here.
      </p>
      <button
        type="button"
        onClick={() => openCreateDrawingDialog()}
        className="mt-3 flex items-center gap-1.5 rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(20,20,45,0.2)] transition-[filter,scale] duration-150 hover:brightness-105 active:scale-[0.98]"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Create your first drawing
      </button>
    </div>
  )
}
