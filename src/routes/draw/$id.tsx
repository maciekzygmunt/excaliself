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

const DrawingCanvas = lazy(() => import("./-components/DrawingCanvas"))

const LoadingState = () => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card text-muted-foreground">
    <Pencil className="h-8 w-8 animate-pulse" />
    <span className="text-sm">Loading drawing...</span>
  </div>
)

export const Route = createFileRoute("/draw/$id")({
  ssr: false,
  loader: async ({ params, context, preload }) => {
    const drawing = await context.queryClient.ensureQueryData(
      drawingQueryOptions(params.id),
    )
    // The server returns null for deleted drawings and drawings that aren't
    // yours (deliberately indistinguishable) — land on Home, not a dead end.
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
  // server round-trip.
  const { data: drawingName } = useQuery({
    ...drawingsQueryOptions(),
    select: (drawings) => drawings.find((d) => d.id === id)?.name,
  })
  useDocumentTitle(drawingName)

  // The loader only guards fresh loads: within staleTime it returns the
  // cached drawing without refetching, and the mount refetch that follows can
  // discover the drawing was deleted from another session. React to the
  // query turning null (undefined means still loading) the same way the
  // loader does — Home plus a toast, never a blank canvas on a dead URL.
  const isGone = drawing === null
  useEffect(() => {
    if (!isGone) return
    toast.error("Drawing not found", { id: "drawing-not-found" })
    navigate({ to: "/draw", replace: true })
  }, [isGone, navigate])

  if (isGone) return <LoadingState />

  // Remount on id change so per-document state (auto-save dedup, edits in
  // progress, Excalidraw scene) is fully reset without manual cleanup.
  return (
    <Suspense fallback={<LoadingState />}>
      <DrawingCanvas key={id} drawingId={id} />
    </Suspense>
  )
}
