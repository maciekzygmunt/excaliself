import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { usersQueryOptions } from "@/features/admin/queries"
import {
  type ActiveSession,
  type CurrentUser,
  currentUserQueryOptions,
  sessionsQueryOptions,
} from "./queries"
import { revokeOtherSessions, revokeSessionById, updateProfile } from "./server"

/**
 * Save the display name optimistically (spec §4.3): the new name lands in
 * the currentUser cache immediately — the sidebar user card reads the same
 * cache, so it updates in the same frame — and rolls back with an error
 * toast if the server call fails. An empty string clears the name, flipping
 * every surface back to the email-prefix fallback.
 *
 * Saves share a mutation scope, so rapid successive commits run in serial:
 * an older request can neither reach the server after a newer one nor roll
 * the cache back over a newer optimistic write.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const currentUserKey = currentUserQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: updateProfile,
    scope: { id: "account-profile" },
    onMutate: async ({ data }) => {
      await queryClient.cancelQueries({ queryKey: currentUserKey })
      const previous = queryClient.getQueryData<CurrentUser>(currentUserKey)
      queryClient.setQueryData<CurrentUser>(currentUserKey, (current) =>
        current ? { ...current, name: data.name || null } : current,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(currentUserKey, context?.previous)
      toast.error("Couldn't save display name")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: currentUserKey })
      // The admin member list shows the same name — drop its cache so an
      // admin's own rename shows up there without waiting out the staleTime.
      queryClient.invalidateQueries(usersQueryOptions())
    },
  })

  return (name: string) => mutation.mutate({ data: { name: name.trim() } })
}

/**
 * Both revoke flavors drop rows optimistically (spec §4.3) and roll back
 * with an error toast if the server call fails — they differ only in which
 * rows survive. They share a mutation scope so overlapping revokes settle
 * in serial: a rollback can never resurrect a row a newer optimistic write
 * already removed.
 */
function useRevokeMutation<TVars>(options: {
  mutationFn: (vars: TVars) => Promise<unknown>
  keep: (session: ActiveSession, vars: TVars) => boolean
  errorMessage: string
}) {
  const queryClient = useQueryClient()
  const sessionsKey = sessionsQueryOptions().queryKey

  return useMutation({
    mutationFn: options.mutationFn,
    scope: { id: "account-sessions" },
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: sessionsKey })
      const previous = queryClient.getQueryData<ActiveSession[]>(sessionsKey)
      queryClient.setQueryData<ActiveSession[]>(sessionsKey, (current) =>
        current?.filter((session) => options.keep(session, vars)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(sessionsKey, context?.previous)
      toast.error(options.errorMessage)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sessionsKey })
    },
  })
}

export function useRevokeSession() {
  const mutation = useRevokeMutation({
    mutationFn: revokeSessionById,
    keep: (session, vars) => session.id !== vars.data.id,
    errorMessage: "Couldn't revoke session",
  })
  return (id: string) => mutation.mutate({ data: { id } })
}

export function useRevokeOtherSessions() {
  const mutation = useRevokeMutation({
    mutationFn: () => revokeOtherSessions(),
    keep: (session) => session.current,
    errorMessage: "Couldn't sign out all other sessions",
  })
  return () => mutation.mutate(undefined)
}
