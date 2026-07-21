import { createFileRoute } from "@tanstack/react-router"
import { usersQueryOptions } from "@/features/admin/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { adminMiddleware } from "@/middleware/admin"
import { MembersSection } from "./-components/MembersSection"

// Admin-only: the middleware guards document requests, and the loader's
// admin-gated query throws the same redirect on client-side navigation.
export const Route = createFileRoute("/_app/settings/members")({
  server: {
    middleware: [adminMiddleware],
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(usersQueryOptions())
  },
  component: MembersPage,
})

function MembersPage() {
  useDocumentTitle("Members", { chrome: true })
  return <MembersSection />
}
