import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { InitialsAvatar } from "@/components/initials-avatar"
import { TypeToConfirmDialog } from "@/components/type-to-confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { userDisplayName } from "@/features/account/display-name"
import { currentUserQueryOptions } from "@/features/account/queries"
import {
  userContentCountsQueryOptions,
  usersQueryOptions,
} from "@/features/admin/queries"
import { deleteUser } from "@/features/admin/server"
import { describeContents } from "@/features/trash/destroy-copy"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"

// Deliberately lean (issue #64): no search, sort, or pagination — those can
// land later if instances outgrow a single screen.
export function MembersSection() {
  const { data: users, isPending } = useQuery(usersQueryOptions())
  const { data: currentUser } = useQuery(currentUserQueryOptions())
  const showSkeleton = useDelayedVisible(isPending)

  if (isPending) return showSkeleton ? <MembersSkeleton /> : null
  if (!users) return null

  const members = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

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
            <div className="flex shrink-0 items-center gap-1">
              <p className="text-xs text-muted-foreground/60">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </p>
              {/* No self-delete here — that lives in the Account danger
                  zone (issue #66). This page being admin-gated, a sole
                  admin is always the viewer, so this also blocks deleting
                  the last admin in the UI; the server enforces both. */}
              {user.id !== currentUser?.id && <MemberRowActions user={user} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// The overflow menu plus the tier-3 type-to-confirm delete (issue #66).
// Pessimistic: the dialog stays open with an in-button pending state until
// the server answers, then the list invalidation drops the row.
function MemberRowActions({
  user,
}: {
  user: { id: string; email: string; name: string | null }
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()
  const displayName = userDisplayName(user)

  // Fetched only once the dialog is up — the danger copy must state what
  // will actually be destroyed, with fresh counts.
  const { data: counts, isError: countsFailed } = useQuery({
    ...userContentCountsQueryOptions(user.id),
    enabled: confirmOpen,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser({ data: user.id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: usersQueryOptions().queryKey,
      }),
    onError: () => toast.error(`Couldn't delete ${displayName}`),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${displayName}`}
            className="text-muted-foreground/60"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${displayName}?`}
        description={deleteDescription(displayName, counts, countsFailed)}
        challenge={user.email}
        confirmLabel="Delete user"
        pendingLabel="Deleting…"
        // No confirm until the copy can state real counts.
        confirmDisabled={!counts}
        onConfirm={() => deleteMutation.mutateAsync()}
      />
    </>
  )
}

function deleteDescription(
  displayName: string,
  counts: { drawings: number; folders: number } | undefined,
  countsFailed: boolean,
) {
  if (countsFailed)
    return `Couldn't load ${displayName}'s content counts. Close this dialog and try again.`
  if (!counts)
    return `This will delete ${displayName}'s account and permanently delete all of their content. This can't be undone.`
  const contents = describeContents(counts.drawings, counts.folders)
  return contents
    ? `This will delete ${displayName}'s account and permanently delete their ${contents}. This can't be undone.`
    : `This will delete ${displayName}'s account. They have no drawings or folders. This can't be undone.`
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
