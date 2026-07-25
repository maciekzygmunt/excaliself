import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { type Share, shareQueryOptions } from "./queries"
import {
  createShare,
  regenerateShareToken,
  setShareAudience,
  stopSharing,
} from "./server"

const onShareError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : "Sharing failed")
}

export function useCreateShare(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (audience: Share["audience"]) =>
      createShare({ data: { drawingId, audience } }),
    onSuccess: (share) => {
      queryClient.setQueryData(shareQueryOptions(drawingId).queryKey, share)
    },
    onError: onShareError,
  })
}

export function useStopSharing(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => stopSharing({ data: drawingId }),
    onSuccess: () => {
      queryClient.setQueryData(shareQueryOptions(drawingId).queryKey, null)
      toast("Sharing stopped", {
        description: "The link is dead and the drawing is private again.",
      })
    },
    onError: onShareError,
  })
}

export function useRegenerateShareToken(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => regenerateShareToken({ data: drawingId }),
    onSuccess: (share) => {
      queryClient.setQueryData(shareQueryOptions(drawingId).queryKey, share)
      toast("Link regenerated", {
        description: "The old link no longer works.",
      })
    },
    onError: onShareError,
  })
}

export function useSetShareAudience(drawingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (audience: Share["audience"]) =>
      setShareAudience({ data: { drawingId, audience } }),
    // Audience is a radio card — flip it optimistically so the selection
    // doesn't lag the click, and roll back if the server disagrees.
    onMutate: async (audience) => {
      const { queryKey } = shareQueryOptions(drawingId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (prev) =>
        prev ? { ...prev, audience } : prev,
      )
      return { previous }
    },
    onError: (error, _audience, context) => {
      queryClient.setQueryData(
        shareQueryOptions(drawingId).queryKey,
        context?.previous,
      )
      onShareError(error)
    },
  })
}
