import { useQuery } from "@tanstack/react-query"
import { InitialsAvatar } from "@/components/initials-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { userDisplayName } from "@/features/account/display-name"
import { usersQueryOptions } from "@/features/admin/queries"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"

// Deliberately lean (issue #64): no search, sort, pagination, or row
// actions — role management, removal, and password resets land in
// follow-up tickets.
export function MembersSection() {
  const { data: users, isPending } = useQuery(usersQueryOptions())
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
            <p className="shrink-0 text-xs text-muted-foreground/60">
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
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
