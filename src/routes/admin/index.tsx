import { createFileRoute, Link } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  ArrowLeft,
  Check,
  Copy,
  LinkIcon,
  Plus,
  Trash2,
  Users,
} from "lucide-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { setupMiddleware } from "@/middleware/setup"
import { createInvite, deleteInvite, getPendingInvites } from "@/server/invites"
import { deleteUser, getAllUsers } from "@/server/users"

const fetchAdminData = createServerFn({ method: "GET" }).handler(async () => {
  const [users, invites] = await Promise.all([
    getAllUsers(),
    getPendingInvites(),
  ])
  return { users, invites }
})

export const Route = createFileRoute("/admin/")({
  server: {
    middleware: [setupMiddleware],
  },
  loader: async () => {
    return await fetchAdminData()
  },
  component: AdminPage,
})

function AdminPage() {
  const { users, invites } = Route.useLoaderData()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [localInvites, setLocalInvites] = useState(invites)
  const [localUsers, setLocalUsers] = useState(users)

  const handleCreateInvite = async () => {
    setLoading(true)
    setError("")

    try {
      const result = await createInvite()
      const newInvite = {
        id: result.id,
        token: result.token,
        invitedBy: "",
        usedBy: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      }
      setLocalInvites([...localInvites, newInvite])
      copyInviteLink(result.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteInvite = async (id: string) => {
    await deleteInvite({ data: id })
    setLocalInvites(localInvites.filter((i) => i.id !== id))
  }

  const handleDeleteUser = async (id: string) => {
    await deleteUser({ data: id })
    setLocalUsers(localUsers.filter((u) => u.id !== id))
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users ({localUsers.length})
              </CardTitle>
              <CardDescription>Manage registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {localUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{user.name || user.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          user.role === "admin"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {user.role}
                      </span>
                      {user.role !== "admin" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete{" "}
                                <strong>{user.name || user.email}</strong>? All
                                their drawings and data will be permanently
                                deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteUser(user.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Invite Links
              </CardTitle>
              <CardDescription>
                Generate invite links for new users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Button onClick={handleCreateInvite} disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" />
                  {loading ? "Generating..." : "Generate Invite Link"}
                </Button>
              </div>
              {error && (
                <p className="mb-4 text-sm text-destructive">{error}</p>
              )}
              <div className="space-y-2">
                {localInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-mono text-sm text-muted-foreground">
                        {invite.token.slice(0, 16)}...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expires:{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyInviteLink(invite.token)}
                      >
                        {copiedToken === invite.token ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDeleteInvite(invite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {localInvites.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No pending invite links
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
