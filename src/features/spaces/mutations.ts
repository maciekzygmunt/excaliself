import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { collectFolderSubtreeIds } from "@/features/folders/subtree"
import { drawingShareQueryOptions } from "@/features/shares/queries"
import type { MoveItem } from "./move-to-team"
import { moveToTeam } from "./server"

type MoveVars = {
  item: MoveItem
  folderId: string | null
  /** Flushes the open canvas's last solo save, as share creation does. */
  beforeMove?: () => Promise<void>
}

/** Private → Team, after the confirm. */
export function useMoveToTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, folderId, beforeMove }: MoveVars) => {
      await beforeMove?.()
      return moveToTeam({ data: { item, folderId } })
    },
    onSuccess: (drawingIds, { item, folderId }) => {
      const moved = new Set(drawingIds)
      // The open canvas reads its space from here, so it joins the Room by
      // id before the share refetch below can drop its link.
      for (const id of drawingIds)
        queryClient.setQueryData(
          drawingQueryOptions(id).queryKey,
          (drawing) => drawing && { ...drawing, space: "team" as const },
        )
      queryClient.setQueryData(drawingsQueryOptions().queryKey, (list) =>
        list?.map((drawing) =>
          moved.has(drawing.id)
            ? {
                ...drawing,
                space: "team" as const,
                folderId: drawing.id === item.id ? folderId : drawing.folderId,
              }
            : drawing,
        ),
      )
      queryClient.setQueryData(foldersQueryOptions().queryKey, (list) => {
        if (!list || item.type !== "folder") return list
        const subtree = collectFolderSubtreeIds(list, item.id)
        return list.map((folder) =>
          subtree.has(folder.id)
            ? {
                ...folder,
                space: "team" as const,
                parentId: folder.id === item.id ? folderId : folder.parentId,
              }
            : folder,
        )
      })
      // Members links are gone.
      for (const id of drawingIds)
        void queryClient.invalidateQueries({
          queryKey: drawingShareQueryOptions(id).queryKey,
        })
      void queryClient.invalidateQueries({
        queryKey: drawingsQueryOptions().queryKey,
        exact: true,
      })
      void queryClient.invalidateQueries(foldersQueryOptions())
      toast("Moved to Team")
    },
    onError: () => toast.error("Failed to move to Team"),
  })
}
