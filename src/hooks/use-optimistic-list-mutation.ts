import {
  type MutationFunction,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

export function patchById<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

export function removeById<T extends { id: string }>(
  list: T[],
  id: string,
): T[] {
  return list.filter((item) => item.id !== id)
}

type Options<TItem, TVariables, TData> = {
  queryKey: QueryKey
  mutationFn: MutationFunction<TData, TVariables>
  optimisticUpdate: (previous: TItem[], variables: TVariables) => TItem[]
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
      queryClient.invalidateQueries({ queryKey })
    },
  })
}
