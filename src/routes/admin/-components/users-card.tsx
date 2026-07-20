import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { InitialsAvatar } from "@/components/initials-avatar"
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
import { userDisplayName } from "@/features/account/display-name"
import { usersQueryOptions } from "@/features/admin/queries"
import { deleteUser } from "@/features/admin/server"

export function UsersSection() {
  const queryClient = useQueryClient()
  const { data: users } = useQuery(usersQueryOptions())
  const { mutate: deleteUserMutation } = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => toast.success("User deleted"),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete user")
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: usersQueryOptions().queryKey,
      })
    },
  })

  return (
    <section>
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Users</h2>
        <p className="text-xs text-muted-foreground">
          {users?.length ?? 0} registered{" "}
          {users?.length === 1 ? "user" : "users"}
        </p>
      </div>

      {/* User list */}
      <div>
        {users?.map((user, index) => (
          <div
            key={user.id}
            className={`group flex items-center justify-between py-2.5 ${
              index !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <InitialsAvatar
                name={user.name}
                email={user.email}
                className="h-7 w-7"
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {userDisplayName(user)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded ${
                  user.role === "admin"
                    ? "bg-notion-terracotta-muted text-notion-terracotta font-medium"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {user.role}
              </span>
              {user.role !== "admin" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="rounded p-1 text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete user</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete{" "}
                        <strong>{user.name || user.email}</strong>? All their
                        drawings and data will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => deleteUserMutation({ data: user.id })}
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
    </section>
  )
}
