import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"
import {
  approveAuthorize,
  denyAuthorize,
  getAuthorizeRequest,
} from "@/features/oauth/server"
import { useDocumentTitle } from "@/lib/document-title"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { m } from "@/paraglide/messages"

// OAuth consent: an MCP client such as Claude.ai sends the member here to
// connect. Signed-out members go through /login (password or SSO) and come
// back. Never in a frame, so another site can't trick a click on Allow.
export const Route = createFileRoute("/oauth/authorize")({
  server: { middleware: [setupMiddleware, authMiddleware] },
  headers: () => ({
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  }),
  // The raw query: the router's parsed search would turn a state of "123"
  // into a number.
  loader: async ({ location }) => {
    const params = Object.fromEntries(new URLSearchParams(location.searchStr))
    return { params, view: await getAuthorizeRequest({ data: params }) }
  },
  component: AuthorizePage,
})

function AuthorizePage() {
  const { params, view } = Route.useLoaderData()
  useDocumentTitle(m.oauth_page_title())

  if (view.kind === "error") return <Returning to={view.redirectTo} />
  if (view.kind === "invalid") {
    return (
      <AuthPage title={m.oauth_invalid_title()} subtitle={view.message}>
        <Button
          render={<Link to="/draw" />}
          nativeButton={false}
          className="w-full"
        >
          {m.oauth_go_home()}
        </Button>
      </AuthPage>
    )
  }
  return <Consent params={params} view={view} />
}

type ConsentView = Extract<
  ReturnType<typeof Route.useLoaderData>["view"],
  { kind: "consent" }
>

function Consent({
  params,
  view,
}: {
  params: Record<string, string>
  view: ConsentView
}) {
  // Set once the browser is on its way back to the client.
  const [leaving, setLeaving] = useState(false)
  const respond = useMutation({
    mutationFn: (allow: boolean) =>
      (allow ? approveAuthorize : denyAuthorize)({ data: params }),
    onSuccess: ({ redirectTo }) => {
      setLeaving(true)
      window.location.assign(redirectTo)
    },
    onError: (error) => toast.error(error.message || m.oauth_connect_failed()),
  })
  const busy = respond.isPending || leaving
  const { clientName, redirectHost, member } = view

  return (
    <AuthPage
      title={m.oauth_title({ client: clientName })}
      subtitle={m.oauth_subtitle()}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border/60 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {m.oauth_signed_in_as()}
          </p>
          <p className="truncate font-medium text-foreground">
            {member.name || member.email}
          </p>
          {member.name && (
            <p className="truncate text-xs text-muted-foreground">
              {member.email}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {m.oauth_can_intro({ client: clientName })}
          </p>
          <ul className="space-y-2 text-sm text-foreground">
            <Permission>{m.oauth_can_see()}</Permission>
            <Permission>{m.oauth_can_create()}</Permission>
            <Permission>{m.oauth_can_propose()}</Permission>
            <Permission>{m.oauth_can_move()}</Permission>
            <Permission>{m.oauth_can_trash()}</Permission>
          </ul>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <X aria-hidden className="h-4 w-4 shrink-0" />
            {m.oauth_cannot()}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => respond.mutate(false)}
          >
            {m.oauth_cancel()}
          </Button>
          <Button
            className="flex-1"
            disabled={busy}
            onClick={() => respond.mutate(true)}
          >
            {respond.isPending && respond.variables
              ? m.oauth_allowing()
              : m.oauth_allow()}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <ParaglideMessage
            message={m.oauth_return_note}
            inputs={{ host: redirectHost }}
            markup={{ em: Host }}
          />
        </p>
      </div>
    </AuthPage>
  )
}

function Permission({ children }: { children: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check aria-hidden className="h-4 w-4 shrink-0 text-iris" />
      {children}
    </li>
  )
}

// Renders {#em}…{/em} in oauth_return_note.
function Host({ children }: { children?: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

// A request the client got wrong: the error goes back to it.
function Returning({ to }: { to: string }) {
  useEffect(() => window.location.replace(to), [to])
  return (
    <AuthPage
      title={m.oauth_returning_title()}
      subtitle={m.oauth_returning_subtitle()}
    >
      {null}
    </AuthPage>
  )
}
