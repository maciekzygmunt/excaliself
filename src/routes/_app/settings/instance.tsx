import { createFileRoute } from "@tanstack/react-router"
import { instanceStatsQueryOptions } from "@/features/instance/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { adminMiddleware } from "@/middleware/admin"
import { m } from "@/paraglide/messages"
import { InstanceSection } from "./-components/InstanceSection"

// Admin-only: the middleware guards document requests, and the loader's
// admin-gated query throws the same redirect on client-side navigation.
export const Route = createFileRoute("/_app/settings/instance")({
  server: {
    middleware: [adminMiddleware],
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(instanceStatsQueryOptions())
  },
  component: InstancePage,
})

function InstancePage() {
  useDocumentTitle(m.settings_nav_instance(), { chrome: true })
  return <InstanceSection />
}
