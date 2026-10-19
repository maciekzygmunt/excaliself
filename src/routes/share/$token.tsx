import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import { createClientOnlyFn } from "@tanstack/react-start"
import { lazy, Suspense, useState } from "react"
import { Mark } from "@/components/identity"
import { resolveShareToken } from "@/features/shares/server"
import { isOpenAsTeam } from "@/features/spaces/server"
import { useApplyTheme } from "@/hooks/use-theme"
import { useDocumentTitle } from "@/lib/document-title"
import { DeadLink } from "./-components/DeadLink"
import { DrawingDamaged } from "./-components/DrawingDamaged"
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
  loader: async ({ params }) => {
    const visit = await resolveShareToken({ data: params.token })
    // The drawing page applies the usual Team access rule.
    if (visit.status === "moved")
      throw redirect({
        to: "/draw/$id",
        params: { id: visit.drawingId },
        replace: true,
      })
    return visit
  },
  component: SharePage,
  pendingComponent: LoadingState,
})

function SharePage() {
  const resolution = Route.useLoaderData()
  const { token } = Route.useParams()
  const { full } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate({ from: "/share/$token" })
  // Not in the URL: a reload should try the room again.
  const [sceneUnreadable, setSceneUnreadable] = useState(false)
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

  if (sceneUnreadable) return <DrawingDamaged />

  // A members link dies when its drawing moves to Team; the member can then
  // open it by id. Anything else goes back to the loader: dead or sign-in.
  const handleLinkDead = async () => {
    const { audience, drawing } = resolution
    if (audience === "members" && (await isOpenAsTeam({ data: drawing.id })))
      return navigate({ to: "/draw/$id", params: { id: drawing.id } })
    return router.invalidate()
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <SharedCanvas
        drawing={resolution.drawing}
        files={resolution.files}
        token={token}
        onRoomFull={() => navigate({ search: { full: true }, replace: true })}
        onLinkDead={() =>
          void handleLinkDead().catch(() => router.invalidate())
        }
        onSceneUnreadable={() => setSceneUnreadable(true)}
      />
    </Suspense>
  )
}
