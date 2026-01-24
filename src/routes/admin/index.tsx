import { createFileRoute, Link } from "@tanstack/react-router"
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
import { trpc } from "@/lib/trpc/client"
import { setupMiddleware } from "@/middleware/setup"

export const Route = createFileRoute("/admin/")({
  server: {
    middleware: [setupMiddleware],
  },
  component: AdminPage,
})

function AdminPage() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const { data, isLoading } = trpc.admin.getAdminData.useQuery()
  const utils = trpc.useUtils()

  const createInviteMutation = trpc.admin.createInvite.useMutation({
    onSuccess: (newInvite) => {
      // Invalidate and refetch to get proper server types
      utils.admin.getAdminData.invalidate()
      copyInviteLink(newInvite.token)
    },
  })

  const deleteInviteMutation = trpc.admin.deleteInvite.useMutation({
    onMutate: async (id) => {
      await utils.admin.getAdminData.cancel()
      const previous = utils.admin.getAdminData.getData()
      utils.admin.getAdminData.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          invites: old.invites.filter((invite) => invite.id !== id),
        }
      })
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        utils.admin.getAdminData.setData(undefined, context.previous)
      }
    },
  })

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onMutate: async (id) => {
      await utils.admin.getAdminData.cancel()
      const previous = utils.admin.getAdminData.getData()
      utils.admin.getAdminData.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          users: old.users.filter((user) => user.id !== id),
        }
      })
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        utils.admin.getAdminData.setData(undefined, context.previous)
      }
    },
  })

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { users, invites } = data

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
                Users ({users.length})
              </CardTitle>
              <CardDescription>Manage registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user) => (
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
                                onClick={() =>
                                  deleteUserMutation.mutate(user.id)
                                }
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
                <Button
                  onClick={() => createInviteMutation.mutate()}
                  disabled={createInviteMutation.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createInviteMutation.isPending
                    ? "Generating..."
                    : "Generate Invite Link"}
                </Button>
              </div>
              {createInviteMutation.error && (
                <p className="mb-4 text-sm text-destructive">
                  {createInviteMutation.error.message}
                </p>
              )}
              <div className="space-y-2">
                {invites.map((invite) => (
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
                        onClick={() => deleteInviteMutation.mutate(invite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {invites.length === 0 && (
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
