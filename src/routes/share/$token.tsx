import { createFileRoute, Link } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { Mark } from "@/components/identity"
import { resolveShareToken } from "@/features/shares/server"
import { useApplyTheme } from "@/hooks/use-theme"
import { useDocumentTitle } from "@/lib/document-title"

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
  // Share pages are logged-out surfaces and render light regardless of the
  // device's stored theme (spec §1.3); the bootstrap script already forced
  // it on load, this covers SPA navigation in from a dark app.
  useApplyTheme("light")
  useDocumentTitle(
    resolution.status === "ok" ? resolution.drawing.name : undefined,
  )

  if (resolution.status === "ok") {
    return (
      <Suspense fallback={<LoadingState />}>
        <SharedCanvas drawing={resolution.drawing} files={resolution.files} />
      </Suspense>
    )
  }

  if (resolution.status === "signin") {
    return <SignInRequired drawingName={resolution.drawingName} />
  }

  return <DeadLink />
}

// Bare placeholders for now — the branded AuthPage-style share states are a
// later slice (#116 scope note). Copy already matches the spec (§1.4) so the
// reskin won't reword anything.

/**
 * The one page every dead token gets — never-existed, stopped,
 * regenerated-away, and trashed are deliberately indistinguishable, so
 * nothing leaks about whether a drawing exists.
 */
function DeadLink() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background p-4 text-center">
      <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">
        This link is no longer active
      </h1>
      <p className="text-sm text-muted-foreground">
        It may have been turned off or replaced by the drawing's owner.
      </p>
      <Link
        to="/"
        className="mt-2 text-sm text-foreground underline-offset-4 hover:underline"
      >
        Go to Excaliself
      </Link>
    </div>
  )
}

function SignInRequired({ drawingName }: { drawingName: string }) {
  const { token } = Route.useParams()
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background p-4 text-center">
      <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">
        Sign in to open this drawing
      </h1>
      <p className="text-sm text-muted-foreground">
        "{drawingName}" is shared with members of this instance.
      </p>
      <p className="text-sm text-muted-foreground">
        You'll return to the drawing right after signing in.
      </p>
      <Link
        to="/login"
        search={{ redirect: `/share/${token}` }}
        className="mt-2 text-sm text-foreground underline-offset-4 hover:underline"
      >
        Sign in
      </Link>
    </div>
  )
}
