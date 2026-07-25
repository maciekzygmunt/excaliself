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

// Every mutation writes the server's returned row (or null) straight into
// the share query cache — no invalidation round-trip, so the dialog flips
// state the moment the server answers.

export function useCreateShare(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (audience: ShareAudience) =>
      createShare({ data: { drawingId, audience } }),
    onSuccess: (share) => {
      queryClient.setQueryData(
        drawingShareQueryOptions(drawingId).queryKey,
        share,
      )
    },
    onError: () => toast.error("Failed to create share link"),
  })
}

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
    // Optimistic: radio cards must feel instant, and the server can only
    // disagree by erroring — then the previous audience rolls back.
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
