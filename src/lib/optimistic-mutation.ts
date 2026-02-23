import type { QueryClient } from "@tanstack/react-query"

/**
 * Creates a standard optimistic mutation config for list-based queries.
 *
 * Handles the cancel → snapshot → optimistic update → rollback → invalidate pattern
 */
export function optimisticListMutation<TItem, TVariables>(opts: {
  queryClient: QueryClient
  queryKey: readonly unknown[]
  updateFn: (items: TItem[], variables: TVariables) => TItem[]
  additionalInvalidations?: (readonly unknown[])[]
}) {
  return {
    onMutate: async (variables: TVariables) => {
      await opts.queryClient.cancelQueries({ queryKey: opts.queryKey })
      const previous = opts.queryClient.getQueryData<TItem[]>(opts.queryKey)
      opts.queryClient.setQueryData<TItem[]>(opts.queryKey, (old = []) =>
        opts.updateFn(old, variables),
      )
      return { previous }
    },
    onError: (
      _err: unknown,
      _vars: TVariables,
      context: { previous?: TItem[] } | undefined,
    ) => {
      opts.queryClient.setQueryData(opts.queryKey, context?.previous)
    },
    onSettled: () => {
      opts.queryClient.invalidateQueries({ queryKey: opts.queryKey })
      for (const key of opts.additionalInvalidations ?? []) {
        opts.queryClient.invalidateQueries({ queryKey: key })
      }
    },
  }
}
