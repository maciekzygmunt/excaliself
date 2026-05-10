import {
  type MutationFunction,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

type Options<TItem, TVariables, TData> = {
  queryKey: QueryKey
  mutationFn: MutationFunction<TData, TVariables>
  optimisticUpdate: (previous: TItem[], variables: TVariables) => TItem[]
  invalidateOnSettled?: readonly QueryKey[]
}

/**
 * Wraps useMutation with the optimistic-list-update pattern: snapshot the
 * cached list, apply an in-place edit, roll back on error, and invalidate on
 * settle. Use for renames, moves, deletes against a query holding an array.
 */
export function useOptimisticListMutation<TItem, TVariables, TData = unknown>({
  queryKey,
  mutationFn,
  optimisticUpdate,
  invalidateOnSettled,
}: Options<TItem, TVariables, TData>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TItem[]>(queryKey)
      queryClient.setQueryData<TItem[]>(queryKey, (current = []) =>
        optimisticUpdate(current, variables),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: () => {
      const keys = invalidateOnSettled ?? [queryKey]
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
