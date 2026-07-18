import { createFileRoute, redirect } from "@tanstack/react-router"
import { Pencil } from "lucide-react"
import { lazy, Suspense } from "react"
import { toast } from "sonner"
import { drawingQueryOptions } from "@/features/drawings/queries"

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
  // Remount on id change so per-document state (auto-save dedup, edits in
  // progress, Excalidraw scene) is fully reset without manual cleanup.
  return (
    <Suspense fallback={<LoadingState />}>
      <DrawingCanvas key={id} drawingId={id} />
    </Suspense>
  )
}
