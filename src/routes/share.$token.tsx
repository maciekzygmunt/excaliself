import { createFileRoute, Link } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { Mark } from "@/components/identity"
import type { ShareTokenResult } from "@/features/shares/server"
import { validateShareToken } from "@/features/shares/server"
import { useApplyTheme } from "@/hooks/use-theme"
import { useDocumentTitle } from "@/lib/document-title"

const GuestCanvas = lazy(() => import("./-share/GuestCanvas"))

const LoadingState = () => (
  <div
    role="status"
    aria-label="Loading drawing"
    className="absolute inset-0 z-10 flex items-center justify-center bg-card"
  >
    <Mark className="h-8 w-8 animate-pulse text-iris motion-reduce:animate-none" />
  </div>
)

export const Route = createFileRoute("/share/$token")({
  // ssr off like /draw/$id — the canvas is client-only anyway, so validation
  // and every state render happen on the client against a fresh server check.
  ssr: false,
  // Token, audience, and deletedAt are re-validated per request (spec §4.1):
  // stop/regenerate must kill old URLs on the very next load, so the loader
  // always asks the server and nothing is cached.
  loader: async ({ params }) => ({
    result: await validateShareToken({ data: params.token }),
  }),
  component: SharePage,
  pendingComponent: LoadingState,
})

function SharePage() {
  const { result } = Route.useLoaderData()
  switch (result.state) {
    case "dead":
      return <DeadLinkPage />
    case "signin":
      return <SignInGatePage drawingName={result.drawingName} />
    case "ok":
      return <SharedDrawing result={result} />
  }
}

function SharedDrawing({
  result,
}: {
  result: Extract<ShareTokenResult, { state: "ok" }>
}) {
  useDocumentTitle(result.drawing.name)
  return (
    <div className="relative h-dvh">
      <Suspense fallback={<LoadingState />}>
        <GuestCanvas drawing={result.drawing} files={result.files} />
      </Suspense>
    </div>
  )
}

// Placeholder share states — the branded AuthPage-style versions land in the
// next slice (#117). Kept deliberately bare, but with the load-bearing rules
// already in place: one generic page for every dead cause, and the sign-in
// gate returns to this URL after login.

function DeadLinkPage() {
  useApplyTheme("light")
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        This link is no longer active
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have been turned off or replaced by the drawing's owner.
      </p>
      <Link to="/" className="mt-2 text-sm font-medium text-iris underline">
        Go to Excaliself
      </Link>
    </main>
  )
}

function SignInGatePage({ drawingName }: { drawingName: string }) {
  const { token } = Route.useParams()
  useApplyTheme("light")
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        Sign in to open this drawing
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        "{drawingName}" is shared with members of this instance. You'll return
        to the drawing right after signing in.
      </p>
      <Link
        to="/login"
        search={{ redirect: `/share/${token}` }}
        className="mt-2 text-sm font-medium text-iris underline"
      >
        Sign in
      </Link>
    </main>
  )
}
