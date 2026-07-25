import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { Mark } from "@/components/identity"
import { resolveShareToken } from "@/features/shares/server"
import { useApplyTheme } from "@/hooks/use-theme"
import { useDocumentTitle } from "@/lib/document-title"
import { DeadLink } from "./-components/DeadLink"
import { DrawingFull } from "./-components/DrawingFull"
import { SignInGate } from "./-components/SignInGate"

const SharedCanvas = lazy(() => import("./-components/SharedCanvas"))

// Same branded canvas loader as /draw/$id: the iris spark mark, pulsing.
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
  // ?full renders the room-full state on an otherwise live link. The real
  // trigger is the participant cap refusing the socket join, which the
  // rate-limits slice wires up; this flag keeps the page reachable (and
  // reviewable) until then. Presence is the whole flag, so a hand-typed
  // ?full=1 and the ?full=true the router itself writes both count.
  validateSearch: (search: Record<string, unknown>): { full?: boolean } =>
    "full" in search ? { full: true } : {},
  // Validation happens at request time, on every visit: the router's default
  // staleTime of 0 re-runs this loader per navigation, and the server fn
  // checks token, audience, and deletedAt fresh — so stop, regenerate, and
  // trash all kill the page on the next load (spec §4.1).
  loader: ({ params }) => resolveShareToken({ data: params.token }),
  component: SharePage,
  pendingComponent: LoadingState,
})

function SharePage() {
  const resolution = Route.useLoaderData()
  // The token is also the room's dial string — the canvas joins on it.
  const { token } = Route.useParams()
  const { full } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate({ from: "/share/$token" })
  // Share pages are logged-out surfaces and render light regardless of the
  // device's stored theme (spec §1.3); the bootstrap script already forced
  // it on load, this covers SPA navigation in from a dark app.
  useApplyTheme("light")
  useDocumentTitle(
    resolution.status === "ok" ? resolution.drawing.name : undefined,
  )

  // Dead is checked first and answers unconditionally: no flag and no
  // session can turn a dead token into any other page.
  if (resolution.status === "dead") return <DeadLink />

  if (resolution.status === "signin") {
    // Revalidating replays the loader with the session cookie the form just
    // set, so the canvas takes over without leaving /share/<token>.
    return (
      <SignInGate
        drawingName={resolution.drawingName}
        onSignedIn={() => router.invalidate()}
      />
    )
  }

  // Retrying drops the flag as well as revalidating — otherwise the flag
  // that put the visitor here would put them straight back. Once the cap is
  // real, the same button re-attempts the join.
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
      />
    </Suspense>
  )
}
