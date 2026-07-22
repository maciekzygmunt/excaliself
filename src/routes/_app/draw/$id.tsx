import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { Pencil } from "lucide-react"
import { lazy, Suspense, useEffect } from "react"
import { toast } from "sonner"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { DrawingPaletteContext } from "../-components/DrawingPaletteContext"
import { TrashedDrawingBanner } from "../-components/TrashedDrawingBanner"

const DrawingCanvas = lazy(() => import("../-components/DrawingCanvas"))

const LoadingState = () => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card text-muted-foreground">
    <Pencil className="h-8 w-8 animate-pulse" />
    <span className="text-sm">Loading drawing...</span>
  </div>
)

export const Route = createFileRoute("/_app/draw/$id")({
  ssr: false,
  loader: async ({ params, context, preload }) => {
    const drawing = await context.queryClient.ensureQueryData(
      drawingQueryOptions(params.id),
    )
    // The server returns null for hard-deleted drawings and drawings that
    // aren't yours (deliberately indistinguishable) — land on Home, not a
    // dead end. Trashed drawings load and render read-only (spec §5.11).
    // ssr is off, so this loader (and the toast) always runs on the client.
    // Hover-intent preloads also run it; they swallow the redirect, so they
    // must not toast either.
    if (!drawing) {
      if (!preload)
        toast.error("Drawing not found", { id: "drawing-not-found" })
      throw redirect({ to: "/draw" })
    }
  },
  component: DrawingPage,
  pendingComponent: LoadingState,
})

function DrawingPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: drawing } = useQuery(drawingQueryOptions(id))

  // Title from the sidebar list cache, not the detail query: renames patch
  // the list optimistically, so the tab tracks them without waiting for the
  // server round-trip. Trashed drawings aren't in the live list — their name
  // comes from the detail query instead (no renaming in the trash anyway).
  const { data: drawingName } = useQuery({
    ...drawingsQueryOptions(),
    select: (drawings) => drawings.find((d) => d.id === id)?.name,
  })
  useDocumentTitle(drawingName ?? drawing?.name)

  // The loader only guards fresh loads: within staleTime it returns the
  // cached drawing without refetching, and the mount refetch that follows can
  // discover the drawing was hard-deleted from another session. React to the
  // query turning null (undefined means still loading) the same way the
  // loader does — Home plus a toast, never a blank canvas on a dead URL.
  const isGone = drawing === null
  useEffect(() => {
    if (!isGone) return
    toast.error("Drawing not found", { id: "drawing-not-found" })
    navigate({ to: "/draw", replace: true })
  }, [isGone, navigate])

  if (isGone) return <LoadingState />

  // Trashed drawings render read-only under a purge banner (spec §5.11).
  // A trashing/restore from any surface refetches the detail query, so this
  // flips live without a reload.
  const trashedAt = drawing?.deletedAt ?? null
  const isTrashed = trashedAt != null

  // Remount on id change so per-document state (auto-save dedup, edits in
  // progress, Excalidraw scene) is fully reset without manual cleanup — and
  // on the trashed flag so a restore lands on a freshly editable canvas
  // instead of toggling Excalidraw's view mode in place.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawingPaletteContext drawingId={id} />
      {trashedAt && drawing && (
        <TrashedDrawingBanner drawing={{ ...drawing, deletedAt: trashedAt }} />
      )}
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<LoadingState />}>
          <DrawingCanvas
            key={`${id}:${isTrashed}`}
            drawingId={id}
            readOnly={isTrashed}
          />
        </Suspense>
      </div>
    </div>
  )
}
