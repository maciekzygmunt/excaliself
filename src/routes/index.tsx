import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { LogOut, Pencil, Plus, Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { signOut } from "@/lib/auth-client"

const getSession = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    })
    return session
  },
)

const checkSetup = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    return context.users.isSetupComplete()
  },
)

const fetchDrawings = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    })
    if (!session?.user) return []
    return context.drawings.getDrawings(session.user.id)
  },
)

const createNewDrawing = createServerFn({ method: "POST" }).handler(
  async ({ context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    })
    if (!session?.user) throw new Error("Unauthorized")
    return context.drawings.createDrawing(session.user.id)
  },
)

const removeDrawing = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    })
    if (!session?.user) throw new Error("Unauthorized")
    await context.drawings.deleteDrawing(data.id, session.user.id)
  })

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const setupComplete = await checkSetup()
    if (!setupComplete) {
      throw redirect({ to: "/setup" })
    }

    const session = await getSession()
    if (!session?.user) {
      throw redirect({ to: "/login" })
    }

    return { session }
  },
  loader: async () => {
    const drawings = await fetchDrawings()
    return { drawings }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { session } = Route.useRouteContext()
  const { drawings } = Route.useLoaderData()
  const navigate = useNavigate()

  const handleNewDrawing = async () => {
    const id = await createNewDrawing()
    navigate({ to: "/draw/$id", params: { id } })
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this drawing?")) {
      await removeDrawing({ data: { id } })
      navigate({ to: "/" })
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: "/login" })
  }

  const isAdmin = session?.user?.role === "admin"

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-xl font-bold">Excalidraw</h1>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
            <span className="text-sm text-muted-foreground">
              {session?.user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Your Drawings</h2>
          <Button onClick={handleNewDrawing}>
            <Plus className="mr-2 h-4 w-4" />
            New Drawing
          </Button>
        </div>

        {drawings.length === 0 ? (
          <Card className="p-12 text-center">
            <CardContent>
              <Pencil className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">No drawings yet</h3>
              <p className="mb-4 text-muted-foreground">
                Create your first drawing to get started
              </p>
              <Button onClick={handleNewDrawing}>
                <Plus className="mr-2 h-4 w-4" />
                Create Drawing
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {drawings.map((drawing) => (
              <Card key={drawing.id} className="group relative overflow-hidden">
                <Link to="/draw/$id" params={{ id: drawing.id }}>
                  <div className="aspect-video bg-muted">
                    {drawing.thumbnail ? (
                      <img
                        src={drawing.thumbnail}
                        alt={drawing.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Pencil className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm font-medium truncate">
                      {drawing.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {new Date(drawing.updatedAt).toLocaleDateString()}
                    </p>
                  </CardHeader>
                </Link>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault()
                    handleDelete(drawing.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
