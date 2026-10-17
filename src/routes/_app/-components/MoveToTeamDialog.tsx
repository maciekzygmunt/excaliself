// The one confirm every private → Team move passes through (spec: Move to
// Team), ported from the sidebar prototype.

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { collectFolderSubtreeIds } from "@/features/folders/subtree"
import type { MoveItem } from "@/features/spaces/move-to-team"
import { useMoveToTeam } from "@/features/spaces/mutations"
import { useActiveSpace } from "./ActiveSpace"

export type PendingMove = {
  item: MoveItem
  name: string
  /** Team folder to land in; null is Team root. */
  folderId: string | null
  counts: { drawings: number; folders: number }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export function MoveToTeamDialog({
  open,
  pendingMove,
  onConfirm,
  onCancel,
}: {
  open: boolean
  pendingMove: PendingMove | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { drawings, folders } = pendingMove?.counts ?? {
    drawings: 0,
    folders: 0,
  }
  // Zero parts drop out; a drawing or an empty folder gets no sentence.
  const contents = [
    drawings && plural(drawings, "drawing"),
    folders && plural(folders, "folder"),
  ]
    .filter(Boolean)
    .join(" and ")

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Move “{pendingMove?.name}” to Team?
          </AlertDialogTitle>
          <AlertDialogDescription>
            All members can see and edit it. You can't move it back to Private.
            {contents && ` This also moves the ${contents} inside it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="primary" onClick={onConfirm}>
            Move to Team
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type MoveToTeamContextValue = {
  /** Opens the confirm. Null while Team is hidden, so no entry point shows. */
  requestMoveToTeam:
    | ((item: MoveItem, name: string, folderId?: string | null) => void)
    | null
  /**
   * The open canvas registers its autosave flush, so a move from any entry
   * point saves the last solo edits first. Returns the unregister.
   */
  registerFlush: (flush: () => Promise<void>) => () => void
}

const MoveToTeamContext = createContext<MoveToTeamContextValue | null>(null)

export function MoveToTeamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: teamEnabled = false } = useQuery({
    ...currentUserQueryOptions(),
    select: (user) => user.teamEnabled,
  })
  const move = useMoveToTeam()
  const { setActiveSpace } = useActiveSpace()
  const [open, setOpen] = useState(false)
  // Kept across close so the copy doesn't blank during the exit animation.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const flushRef = useRef<(() => Promise<void>) | null>(null)

  const requestMoveToTeam = useCallback(
    (item: MoveItem, name: string, folderId: string | null = null) => {
      const drawings =
        queryClient.getQueryData(drawingsQueryOptions().queryKey) ?? []
      const folders =
        queryClient.getQueryData(foldersQueryOptions().queryKey) ?? []
      let counts = { drawings: 0, folders: 0 }
      if (item.type === "folder") {
        const subtree = collectFolderSubtreeIds(folders, item.id)
        counts = {
          drawings: drawings.filter(
            (d) => d.folderId !== null && subtree.has(d.folderId),
          ).length,
          folders: subtree.size - 1,
        }
      }
      setPendingMove({ item, name, folderId, counts })
      setOpen(true)
    },
    [queryClient],
  )

  const confirmMove = () => {
    if (!pendingMove) return
    move.mutate({
      item: pendingMove.item,
      folderId: pendingMove.folderId,
      beforeMove: flushRef.current ?? undefined,
    })
    setOpen(false)
    // The sidebar shows Team, so the item is seen landing.
    setActiveSpace("team")
  }

  const registerFlush = useCallback((flush: () => Promise<void>) => {
    flushRef.current = flush
    return () => {
      if (flushRef.current === flush) flushRef.current = null
    }
  }, [])

  const value = useMemo(
    () => ({
      requestMoveToTeam: teamEnabled ? requestMoveToTeam : null,
      registerFlush,
    }),
    [teamEnabled, requestMoveToTeam, registerFlush],
  )

  return (
    <MoveToTeamContext.Provider value={value}>
      {children}
      <MoveToTeamDialog
        open={open}
        pendingMove={pendingMove}
        onConfirm={confirmMove}
        onCancel={() => setOpen(false)}
      />
    </MoveToTeamContext.Provider>
  )
}

export function useMoveToTeamDialog() {
  const ctx = useContext(MoveToTeamContext)
  if (!ctx)
    throw new Error(
      "useMoveToTeamDialog must be used within MoveToTeamProvider",
    )
  return ctx
}
