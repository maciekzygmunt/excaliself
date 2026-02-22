import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { getDrawings } from "@/server/drawings"
import { getFolders } from "@/server/folders"
import { DrawSidebar } from "./-components/DrawSidebar"
import { SidebarContextProvider } from "./-components/SidebarContext"

const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.session)

export const Route = createFileRoute("/draw")({
  server: {
    middleware: [setupMiddleware, authMiddleware],
  },
  loader: async ({ context }) => {
    const session = await getSession()
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["drawings"],
        queryFn: getDrawings,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["folders"],
        queryFn: getFolders,
      }),
    ])
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
  return (
    <SidebarContextProvider>
      <DrawSidebar userEmail={userEmail} isAdmin={isAdmin} />
      <SidebarInset className="overflow-clip">
        <Outlet />
      </SidebarInset>
    </SidebarContextProvider>
  )
}
