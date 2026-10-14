import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { ShareAudience } from "./access"
import { drawingShareQueryOptions } from "./queries"
import {
  createShare,
  regenerateShare,
  setShareAudience,
  stopSharing,
} from "./server"

/** `beforeCreate` flushes the last solo save; once shared, it is refused. */
export function useCreateShare(
  drawingId: string,
  options: { beforeCreate?: () => Promise<void> } = {},
) {
  const queryClient = useQueryClient()
  const { beforeCreate } = options
  return useMutation({
    mutationFn: async (audience: ShareAudience) => {
      await beforeCreate?.()
      return createShare({ data: { drawingId, audience } })
    },
    onSuccess: (share) => {
      queryClient.setQueryData(
        drawingShareQueryOptions(drawingId).queryKey,
        share,
      )
    },
    onError: () => toast.error("Failed to create share link"),
  })
}

/** Resolves after the room has flushed and closed; then autosave resumes. */
export function useStopSharing(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => stopSharing({ data: drawingId }),
    onSuccess: () => {
      queryClient.setQueryData(
        drawingShareQueryOptions(drawingId).queryKey,
        null,
      )
      toast("Sharing stopped", {
        description: "The link is dead and the drawing is private again.",
      })
    },
    onError: () => toast.error("Failed to stop sharing"),
  })
}

export function useRegenerateShare(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => regenerateShare({ data: drawingId }),
    onSuccess: (share) => {
      queryClient.setQueryData(
        drawingShareQueryOptions(drawingId).queryKey,
        share,
      )
      toast("Link regenerated", {
        description: "The old link no longer works.",
      })
    },
    onError: () => toast.error("Failed to regenerate link"),
  })
}

export function useSetShareAudience(drawingId: string) {
  const queryClient = useQueryClient()
  const queryKey = drawingShareQueryOptions(drawingId).queryKey
  return useMutation({
    mutationFn: (audience: ShareAudience) =>
      setShareAudience({ data: { drawingId, audience } }),
    onMutate: async (audience) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (share) =>
        share ? { ...share, audience } : share,
      )
      return { previous }
    },
    onError: (_error, _audience, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous)
      toast.error("Failed to change who can open the link")
    },
    onSuccess: (share) => {
      queryClient.setQueryData(queryKey, share)
    },
  })
}
