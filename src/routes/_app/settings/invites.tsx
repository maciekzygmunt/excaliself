import { createFileRoute } from "@tanstack/react-router"
import { pendingInvitesQueryOptions } from "@/features/invites/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { adminMiddleware } from "@/middleware/admin"
import { m } from "@/paraglide/messages"
import { InvitesSection } from "./-components/InvitesSection"

// Admin-only: the middleware guards document requests, and the loader's
// admin-gated query throws the same redirect on client-side navigation.
export const Route = createFileRoute("/_app/settings/invites")({
  server: {
    middleware: [adminMiddleware],
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(pendingInvitesQueryOptions())
  },
  component: InvitesPage,
})

function InvitesPage() {
  useDocumentTitle(m.settings_nav_invites(), { chrome: true })
  return <InvitesSection />
}
