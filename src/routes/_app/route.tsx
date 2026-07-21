import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useSettingsShortcut } from "@/hooks/use-settings-shortcut"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { CreateDialogProvider } from "./-components/CreateDialog"
import { SidebarReopenButton } from "./-components/SidebarReopenButton"
import { DrawSidebar } from "./-components/sidebar"

const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.session)

export const Route = createFileRoute("/_app")({
  server: {
    middleware: [setupMiddleware, authMiddleware],
  },
  loader: async ({ context }) => {
    const session = await getSession()
    // isAdmin comes from the currentUser query (a fresh row read), not the
    // session, whose cookie-cached role can lag a demotion by five minutes —
    // a self-demote updates that cache and invalidates the router, and the
    // admin-only chrome has to disappear right then (issue #65).
    const [user] = await Promise.all([
      context.queryClient.ensureQueryData(currentUserQueryOptions()),
      context.queryClient.ensureQueryData(drawingsQueryOptions()),
      context.queryClient.ensureQueryData(foldersQueryOptions()),
    ])
    return { session, isAdmin: user.role === "admin" }
  },
  component: AppShellLayout,
})

function AppShellLayout() {
  const { session, isAdmin } = Route.useLoaderData()
  // The user card subscribes to the currentUser cache so an optimistic
  // profile save on /settings shows up in the sidebar in the same frame.
  const { data: currentUser } = useQuery(currentUserQueryOptions())
  useSettingsShortcut()

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "240px" } as React.CSSProperties}
    >
      <CreateDialogProvider>
        <DrawSidebar
          user={{
            email: currentUser?.email ?? session.user?.email ?? "",
            name: currentUser?.name ?? null,
            isAdmin,
          }}
        />
        <SidebarInset className="overflow-clip bg-card md:peer-data-[variant=inset]:m-2.5 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-[10px] md:peer-data-[variant=inset]:shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_10px_28px_rgba(30,30,70,0.09)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2.5 dark:md:peer-data-[variant=inset]:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_28px_rgba(0,0,0,0.35)]">
          <SidebarReopenButton />
          <Outlet />
        </SidebarInset>
      </CreateDialogProvider>
    </SidebarProvider>
  )
}
