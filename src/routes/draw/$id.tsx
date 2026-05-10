import { createFileRoute } from "@tanstack/react-router"
import { Pencil } from "lucide-react"
import { lazy, Suspense } from "react"
import { getDrawingWithFiles } from "@/server/drawings"

const DrawingCanvas = lazy(() => import("./-components/DrawingCanvas"))

const LoadingState = () => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
    <Pencil className="h-8 w-8 animate-pulse" />
    <span className="text-sm">Loading drawing...</span>
  </div>
)

export const Route = createFileRoute("/draw/$id")({
  ssr: false,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["drawing", params.id],
      queryFn: () => getDrawingWithFiles({ data: params.id }),
    })
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
