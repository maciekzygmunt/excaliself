import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { DrawSidebar } from "./-components/sidebar"

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
      context.queryClient.ensureQueryData(drawingsQueryOptions()),
      context.queryClient.ensureQueryData(foldersQueryOptions()),
    ])
    return { session }
  },
  component: DrawLayout,
})

function DrawLayout() {
  const { session } = Route.useLoaderData()

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "260px" } as React.CSSProperties}
    >
      <DrawSidebar
        userEmail={session.user?.email ?? ""}
        isAdmin={session.user.role === "admin"}
      />
      <SidebarInset className="overflow-clip">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
