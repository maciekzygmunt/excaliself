import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { usersQueryOptions } from "@/features/admin/queries"
import type { ThemePreference } from "@/lib/theme"
import {
  type ActiveSession,
  type CurrentUser,
  currentUserQueryOptions,
  sessionsQueryOptions,
} from "./queries"
import {
  revokeOtherSessions,
  revokeSessionById,
  updateProfile,
  updateTheme,
} from "./server"
import { compareSessions } from "./sessions"

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
 * Save the Appearance choice optimistically: the preference lands in the
 * currentUser cache immediately — the app shell's useUserTheme reads that
 * cache, so the chrome re-themes (and the localStorage mirror updates) in
 * the same render pass — and rolls back with an error toast on failure,
 * which re-themes back the same way. The shared scope serializes rapid
 * clicks so an older save can't overwrite a newer optimistic write.
 */
export function useUpdateTheme() {
  const queryClient = useQueryClient()
  const currentUserKey = currentUserQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: updateTheme,
    scope: { id: "account-theme" },
    onMutate: async ({ data }) => {
      await queryClient.cancelQueries({ queryKey: currentUserKey })
      const previous = queryClient.getQueryData<CurrentUser>(currentUserKey)
      queryClient.setQueryData<CurrentUser>(currentUserKey, (current) =>
        current ? { ...current, theme: data.theme } : current,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(currentUserKey, context?.previous)
      toast.error("Couldn't save theme preference")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: currentUserKey })
    },
  })

  return (theme: ThemePreference) => mutation.mutate({ data: { theme } })
}

/**
 * Both revoke flavors drop rows optimistically (spec §4.3) and roll back
 * with an error toast if the server call fails — they differ only in which
 * rows survive. The shared scope serializes the server calls, but every
 * onMutate still fires at click time — so a failure must not restore a
 * whole-list snapshot, which would resurrect rows a later overlapping
 * revoke already removed. Rollback instead re-inserts only the rows this
 * mutation itself removed and that nothing else has since put back.
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
      const current = queryClient.getQueryData<ActiveSession[]>(sessionsKey)
      const removed =
        current?.filter((session) => !options.keep(session, vars)) ?? []
      queryClient.setQueryData<ActiveSession[]>(sessionsKey, (list) =>
        list?.filter((session) => options.keep(session, vars)),
      )
      return { removed }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData<ActiveSession[]>(sessionsKey, (list) => {
        if (!list) return list
        const present = new Set(list.map((session) => session.id))
        const resurrected = (context?.removed ?? []).filter(
          (session) => !present.has(session.id),
        )
        return [...list, ...resurrected].sort(compareSessions)
      })
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
