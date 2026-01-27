import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminMiddleware } from "@/middleware/admin"
import { setupMiddleware } from "@/middleware/setup"
import { getPendingInvites } from "@/server/invites"
import { getAllUsers } from "@/server/users"
import { InvitesCard } from "./-components/invites-card"
import { UsersCard } from "./-components/users-card"

export const Route = createFileRoute("/admin/")({
  server: {
    middleware: [setupMiddleware, adminMiddleware],
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["admin", "invites"],
        queryFn: getPendingInvites,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["admin", "users"],
        queryFn: getAllUsers,
      }),
    ])
  },
  component: AdminPage,
})

function AdminPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          <UsersCard />
          <InvitesCard />
        </div>
      </main>
    </div>
  )
}
