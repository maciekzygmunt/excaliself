import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { createClientOnlyFn } from "@tanstack/react-start"
import { lazy, Suspense } from "react"
import { Mark } from "@/components/identity"
import { resolveShareToken } from "@/features/shares/server"
import { useApplyTheme } from "@/hooks/use-theme"
import { useDocumentTitle } from "@/lib/document-title"
import { DeadLink } from "./-components/DeadLink"
import { DrawingFull } from "./-components/DrawingFull"
import { SignInGate } from "./-components/SignInGate"
import { TooManyAttempts } from "./-components/TooManyAttempts"

// Client-only, so Excalidraw stays out of the server bundle.
const SharedCanvas = lazy(
  createClientOnlyFn(() => import("./-components/SharedCanvas")),
)

const LoadingState = () => (
  <div
    role="status"
    aria-label="Loading drawing"
    className="flex h-dvh items-center justify-center bg-card"
  >
    <Mark className="h-8 w-8 animate-pulse text-iris motion-reduce:animate-none" />
  </div>
)

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  // ?full shows the room-full state; a search param so retry just drops it.
  validateSearch: (search: Record<string, unknown>): { full?: boolean } =>
    "full" in search ? { full: true } : {},
  // Re-runs per navigation (staleTime 0), so a stopped link dies on next load.
  loader: ({ params }) => resolveShareToken({ data: params.token }),
  component: SharePage,
  pendingComponent: LoadingState,
})

function SharePage() {
  const resolution = Route.useLoaderData()
  const { token } = Route.useParams()
  const { full } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate({ from: "/share/$token" })
  // The bootstrap script forces light on load; this covers SPA navigation.
  useApplyTheme("light")
  useDocumentTitle(
    resolution.status === "ok" ? resolution.drawing.name : undefined,
  )

  if (resolution.status === "throttled")
    return <TooManyAttempts onRetry={() => router.invalidate()} />

  if (resolution.status === "dead") return <DeadLink />

  if (resolution.status === "signin") {
    // Replays the loader with the new session cookie.
    return (
      <SignInGate
        drawingName={resolution.drawingName}
        onSignedIn={() => router.invalidate()}
      />
    )
  }

  if (full)
    return (
      <DrawingFull onRetry={() => navigate({ search: {}, replace: true })} />
    )

  return (
    <Suspense fallback={<LoadingState />}>
      <SharedCanvas
        drawing={resolution.drawing}
        files={resolution.files}
        token={token}
        onRoomFull={() => navigate({ search: { full: true }, replace: true })}
        // The loader decides the page: dead link or sign-in gate.
        onLinkDead={() => router.invalidate()}
      />
    </Suspense>
  )
}
