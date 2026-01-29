import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { DrawSidebar } from "./-components/DrawSidebar"

const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.session)

export const Route = createFileRoute("/draw")({
  server: {
    middleware: [setupMiddleware, authMiddleware],
  },
  loader: async () => {
    const session = await getSession()
    return { session }
  },
  component: DrawLayout,
})

function DrawLayout() {
  const { session } = Route.useLoaderData()

  return (
    <SidebarProvider defaultOpen>
      <DrawLayoutShell
        userEmail={session.user?.email ?? ""}
        isAdmin={session.user.role === "admin"}
      />
    </SidebarProvider>
  )
}

function DrawLayoutShell({
  userEmail,
  isAdmin,
}: {
  userEmail: string
  isAdmin: boolean
}) {
  const { state } = useSidebar()

  return (
    <>
      {state === "collapsed" && (
        <div className="fixed left-4 top-4 z-50">
          <SidebarTrigger className="h-8 w-8 rounded-md border bg-background shadow-sm" />
        </div>
      )}
      <DrawSidebar
        userEmail={userEmail}
        isAdmin={isAdmin}
      />
      <SidebarInset className="overflow-clip">
        <Outlet />
      </SidebarInset>
    </>
  )
}
