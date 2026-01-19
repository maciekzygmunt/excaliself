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
import { getDrawings } from "@/server/drawings"
import { getFolders } from "@/server/folders"
import { DrawSidebar } from "./-components/DrawSidebar"

const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.session)

export const Route = createFileRoute("/draw")({
  server: {
    middleware: [setupMiddleware, authMiddleware],
  },
  loader: async () => {
    const [drawings, folders, session] = await Promise.all([
      getDrawings(),
      getFolders(),
      getSession(),
    ])
    return { drawings, folders, session }
  },
  component: DrawLayout,
})

function DrawLayout() {
  const { drawings, folders, session } = Route.useLoaderData()
  const params = Route.useParams() as { id?: string }

  return (
    <SidebarProvider defaultOpen>
      <DrawLayoutShell
        drawings={drawings}
        folders={folders}
        currentDrawingId={params.id ?? ""}
        userEmail={session?.user.email ?? ""}
        isAdmin={session?.user.role === "admin"}
      />
    </SidebarProvider>
  )
}

function DrawLayoutShell({
  drawings,
  folders,
  currentDrawingId,
  userEmail,
  isAdmin,
}: {
  drawings: Awaited<ReturnType<typeof getDrawings>>
  folders: Awaited<ReturnType<typeof getFolders>>
  currentDrawingId: string
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
        drawings={drawings}
        folders={folders}
        currentDrawingId={currentDrawingId}
        userEmail={userEmail}
        isAdmin={isAdmin}
      />
      <SidebarInset className="overflow-clip">
        <Outlet />
      </SidebarInset>
    </>
  )
}
