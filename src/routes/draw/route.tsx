import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { CreateDrawingDialogProvider } from "./-components/CreateDrawingDialog"
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
      style={{ "--sidebar-width": "240px" } as React.CSSProperties}
    >
      <CreateDrawingDialogProvider>
        <DrawSidebar
          user={{
            email: session.user?.email ?? "",
            isAdmin: session.user.role === "admin",
          }}
        />
        <SidebarInset className="overflow-clip bg-card md:peer-data-[variant=inset]:m-2.5 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-[10px] md:peer-data-[variant=inset]:shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_10px_28px_rgba(30,30,70,0.09)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2.5 dark:md:peer-data-[variant=inset]:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_28px_rgba(0,0,0,0.35)]">
          <Outlet />
        </SidebarInset>
      </CreateDrawingDialogProvider>
    </SidebarProvider>
  )
}
