import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { usersQueryOptions } from "@/features/admin/queries"
import { pendingInvitesQueryOptions } from "@/features/auth/queries"
import { adminMiddleware } from "@/middleware/admin"
import { setupMiddleware } from "@/middleware/setup"
import { InvitesSection } from "./-components/invites-card"
import { UsersSection } from "./-components/users-card"

export const Route = createFileRoute("/admin/")({
  server: {
    middleware: [setupMiddleware, adminMiddleware],
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(pendingInvitesQueryOptions()),
      context.queryClient.ensureQueryData(usersQueryOptions()),
    ])
  },
  component: AdminPage,
})

function AdminPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to drawings
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-notion-terracotta text-sm font-semibold text-white">
              E
            </div>
            <div>
              <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">
                Admin settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage users and invite links
              </p>
            </div>
          </div>
        </div>

        {/* Users */}
        <UsersSection />

        {/* Divider */}
        <div className="my-8 h-px bg-border" />

        {/* Invites */}
        <InvitesSection />
      </div>
    </div>
  )
}
