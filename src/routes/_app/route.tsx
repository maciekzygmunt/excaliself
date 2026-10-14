import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useSettingsShortcut } from "@/hooks/use-settings-shortcut"
import { useStoredTheme } from "@/hooks/use-theme"
import { authMiddleware } from "@/middleware/auth"
import { setupMiddleware } from "@/middleware/setup"
import { CommandPaletteProvider } from "./-components/CommandPalette"
import { CreateDialogProvider } from "./-components/CreateDialog"
import { MoveToTeamProvider } from "./-components/MoveToTeamDialog"
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
  // Applies this browser's stored theme choice (spec §4.4, device-scoped).
  useStoredTheme()

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "240px" } as React.CSSProperties}
    >
      <CreateDialogProvider>
        <MoveToTeamProvider>
          <CommandPaletteProvider>
            <DrawSidebar
              user={{
                email: currentUser?.email ?? session.user?.email ?? "",
                name: currentUser?.name ?? null,
                isAdmin,
              }}
            />
            {/* The Etched panel look lives in the SidebarInset primitive. */}
            <SidebarInset className="overflow-clip">
              <SidebarReopenButton />
              <Outlet />
            </SidebarInset>
          </CommandPaletteProvider>
        </MoveToTeamProvider>
      </CreateDialogProvider>
    </SidebarProvider>
  )
}
