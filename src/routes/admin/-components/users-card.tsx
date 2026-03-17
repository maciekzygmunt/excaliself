import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
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
import { deleteUser, getAllUsers } from "@/server/users"

export function UsersSection() {
  const queryClient = useQueryClient()
  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAllUsers,
  })
  const { mutate: deleteUserMutation } = useMutation({
    mutationFn: deleteUser,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] })
    },
  })

  return (
    <section>
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Users</h2>
        <p className="text-xs text-muted-foreground">
          {users?.length ?? 0} registered {users?.length === 1 ? "user" : "users"}
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {user.name || user.email}
                </p>
                {user.name && (
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded ${
                  user.role === "admin"
                    ? "bg-brand-muted text-brand font-medium"
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
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
