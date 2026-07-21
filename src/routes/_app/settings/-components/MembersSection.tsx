import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { InitialsAvatar } from "@/components/initials-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { userDisplayName } from "@/features/account/display-name"
import { usersQueryOptions } from "@/features/admin/queries"
import { pendingPasswordResetsQueryOptions } from "@/features/password-resets/queries"
import {
  createPasswordReset,
  revokePasswordReset,
} from "@/features/password-resets/server"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"

// Deliberately lean (issue #64): no search, sort, or pagination — role
// management and removal land in follow-up tickets. Row actions carry the
// admin-generated password-reset flow (issue #68).
export function MembersSection() {
  const queryClient = useQueryClient()
  const resetsKey = pendingPasswordResetsQueryOptions().queryKey
  const { data: users, isPending } = useQuery(usersQueryOptions())
  const { data: pendingResets } = useQuery(pendingPasswordResetsQueryOptions())

  // The link is the only copy of the token the admin will ever see — it goes
  // straight to the clipboard (same mechanic as invites) and the toast is
  // the confirmation.
  const { mutate: resetPassword } = useMutation({
    mutationFn: createPasswordReset,
    onSuccess: ({ token }) => {
      navigator.clipboard.writeText(
        `${window.location.origin}/reset-password?token=${token}`,
      )
      toast.success("Reset link copied — single-use, valid for 24 hours")
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Couldn't create reset link",
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: resetsKey })
    },
  })
  const { mutate: revokeReset } = useMutation({
    mutationFn: revokePasswordReset,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: resetsKey })
    },
  })

  const showSkeleton = useDelayedVisible(isPending)

  if (isPending) return showSkeleton ? <MembersSkeleton /> : null
  if (!users) return null

  const members = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const pendingByUserId = new Set(pendingResets?.map((reset) => reset.userId))

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Members</h2>
        <p className="text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? "member" : "members"}
        </p>
      </div>

      <ul>
        {members.map((user, index) => (
          <li
            key={user.id}
            className={`flex items-center justify-between gap-3 py-2.5 ${
              index !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
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
            <div className="flex shrink-0 items-center gap-2">
              {pendingByUserId.has(user.id) && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  Reset link pending
                  <button
                    type="button"
                    onClick={() => revokeReset({ data: { userId: user.id } })}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-destructive"
                  >
                    Revoke
                  </button>
                </span>
              )}
              <p className="text-xs text-muted-foreground/60">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label={`Actions for ${userDisplayName(user)}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => resetPassword({ data: { userId: user.id } })}
                  >
                    <KeyRound className="h-4 w-4" />
                    Reset password
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Mirrors the loaded layout: section header plus a few member rows.
function MembersSkeleton() {
  return (
    <div>
      <div className="mb-4 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div>
        {[0, 1, 2].map((rowIndex) => (
          <div
            key={rowIndex}
            className={`flex items-center gap-3 py-2.5 ${
              rowIndex !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
