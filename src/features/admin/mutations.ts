import { toast } from "sonner"
import {
  patchById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { type AdminUser, usersQueryOptions } from "./queries"
import type { Role } from "./roles"
import { setUserRole } from "./server"

/**
 * Change another member's role optimistically (spec §4.3): the row flips in
 * place and rolls back with an error toast if the server rejects — e.g. the
 * last-admin guard racing a concurrent demotion. Self-demotion doesn't go
 * through here; it's confirmed and applied pessimistically in MembersSection.
 */
export function useSetRole() {
  const mutation = useOptimisticListMutation<
    AdminUser,
    { data: { userId: string; role: Role } }
  >({
    queryKey: usersQueryOptions().queryKey,
    mutationFn: setUserRole,
    optimisticUpdate: (previous, { data }) =>
      patchById(previous, data.userId, { role: data.role }),
    onRollback: () => toast.error("Couldn't change role"),
  })

  return (userId: string, role: Role) =>
    mutation.mutate({ data: { userId, role } })
}
