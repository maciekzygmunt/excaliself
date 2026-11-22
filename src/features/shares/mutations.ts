import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { m } from "@/paraglide/messages"
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
    onError: () => toast.error(m.share_create_failed()),
  })
}

/**
 * Resolves after the room has flushed and closed; then a Private drawing's
 * autosave resumes. A Team drawing's Room keeps its members.
 */
export function useStopSharing(
  drawingId: string,
  { isTeam }: { isTeam: boolean },
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => stopSharing({ data: drawingId }),
    onSuccess: () => {
      queryClient.setQueryData(
        drawingShareQueryOptions(drawingId).queryKey,
        null,
      )
      toast(m.share_stopped(), {
        description: isTeam
          ? m.share_stopped_team()
          : m.share_stopped_private(),
      })
    },
    onError: () => toast.error(m.share_stop_failed()),
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
      toast(m.share_regenerated(), {
        description: m.share_regenerated_description(),
      })
    },
    onError: () => toast.error(m.share_regenerate_failed()),
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
      toast.error(m.share_audience_failed())
    },
    onSuccess: (share) => {
      queryClient.setQueryData(queryKey, share)
    },
  })
}
