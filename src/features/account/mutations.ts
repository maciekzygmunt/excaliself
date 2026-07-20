import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { usersQueryOptions } from "@/features/admin/queries"
import { type CurrentUser, currentUserQueryOptions } from "./queries"
import { updateProfile } from "./server"

/**
 * Save the display name optimistically (spec §4.3): the new name lands in
 * the currentUser cache immediately — the sidebar user card reads the same
 * cache, so it updates in the same frame — and rolls back with an error
 * toast if the server call fails. An empty string clears the name, flipping
 * every surface back to the email-prefix fallback.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const currentUserKey = currentUserQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: updateProfile,
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
