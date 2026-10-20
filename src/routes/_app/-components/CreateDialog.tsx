import { useNavigate } from "@tanstack/react-router"
import { Folder, Lock, Plus, Users } from "lucide-react"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import type { Space } from "@/db/schema"
import { isDemoRefusal } from "@/features/demo/policy"
import { useCreateDrawing } from "@/features/drawings/mutations"
import { useCreateFolder } from "@/features/folders/mutations"
import { useBrowsedSpace } from "@/features/spaces/browse"
import { useActiveSpace } from "./ActiveSpace"

export type FolderScope = { id: string; name: string }

// `space` picks where a root-level item lands; without it, the space being
// browsed. Inside a folder the server uses the folder's space instead.
export type CreateTarget =
  | { kind: "drawing"; folder?: FolderScope | null; space?: Space }
  | { kind: "folder"; space?: Space }

type CreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: CreateTarget
}

export function CreateDialog({
  open,
  onOpenChange,
  target,
}: CreateDialogProps) {
  const navigate = useNavigate()
  const createDrawingMutation = useCreateDrawing()
  const createFolderMutation = useCreateFolder()
  const browsedSpace = useBrowsedSpace()
  const shownSpace = target.space ?? browsedSpace
  const space = shownSpace ?? "private"
  const [name, setName] = useState("")
  // Synchronous guard against a double Enter racing ahead of isPending's
  // re-render (same pattern the inline folder row used).
  const submittedRef = useRef(false)

  const isPending =
    createDrawingMutation.isPending || createFolderMutation.isPending

  // The provider keeps this component mounted across opens — reset on every
  // open so a previously created name can't leak into the next session
  useEffect(() => {
    if (open) setName("")
  }, [open])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || submittedRef.current) return
    submittedRef.current = true
    try {
      if (target.kind === "drawing") {
        const id = await createDrawingMutation.mutateAsync({
          data: { name: trimmed, folderId: target.folder?.id ?? null, space },
        })
        onOpenChange(false)
        navigate({ to: "/draw/$id", params: { id } })
      } else {
        await createFolderMutation.mutateAsync({
          data: { name: trimmed, parentId: null, space },
        })
        onOpenChange(false)
      }
    } catch (error) {
      // Keep the dialog open so the typed name isn't lost
      toast.error(
        isDemoRefusal(error)
          ? error.message
          : target.kind === "drawing"
            ? "Failed to create drawing"
            : "Failed to create folder",
      )
    } finally {
      submittedRef.current = false
    }
  }

  const folder = target.kind === "drawing" ? (target.folder ?? null) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[30%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <DialogTitle className="sr-only">
          {target.kind === "drawing" ? "Create drawing" : "Create folder"}
        </DialogTitle>
        <div className="m-2 flex items-center gap-2.5 rounded-md bg-well px-3 py-2.5 shadow-well">
          <Plus className="h-4 w-4 shrink-0 text-iris" strokeWidth={2.5} />
          <input
            // The whole dialog exists to type a name into — focus it on open
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submit()
              }
            }}
            disabled={isPending}
            placeholder={
              target.kind === "drawing" ? "Drawing name…" : "Folder name…"
            }
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />
        </div>
        <div className="flex items-center justify-between border-t border-hairline bg-muted/40 px-4 py-2">
          {folder ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Folder className="h-3 w-3 shrink-0 fill-iris/70 text-iris" />
              in {folder.name}
            </span>
          ) : shownSpace ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {shownSpace === "team" ? (
                <Users className="h-3 w-3 shrink-0 text-iris" />
              ) : (
                <Lock className="h-3 w-3 shrink-0 text-iris" />
              )}
              in {shownSpace === "team" ? "Team" : "Private"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">
              {target.kind === "drawing" ? "New drawing" : "New folder"}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <Kbd className="h-4 min-w-4 text-[10px]">↵</Kbd> to create
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CreateDialogContextValue = {
  /** Without a space, creates in the sidebar's active space. */
  openCreateDrawingDialog: (folder?: FolderScope, space?: Space) => void
  openCreateFolderDialog: (space?: Space) => void
}

const CreateDialogContext = createContext<CreateDialogContextValue | null>(null)

export function CreateDialogProvider({ children }: { children: ReactNode }) {
  const { activeSpace } = useActiveSpace()
  // While Team is hidden there is one space, so the dialog names none.
  const inSpace = useCallback(
    (space?: Space) => (activeSpace ? (space ?? activeSpace) : undefined),
    [activeSpace],
  )
  const [open, setOpen] = useState(false)
  // Kept across close so the content doesn't flip during the exit animation
  const [target, setTarget] = useState<CreateTarget>({ kind: "drawing" })

  const openCreateDrawingDialog = useCallback(
    (folder?: FolderScope, space?: Space) => {
      setTarget({
        kind: "drawing",
        folder: folder ?? null,
        space: inSpace(space),
      })
      setOpen(true)
    },
    [inSpace],
  )

  const openCreateFolderDialog = useCallback(
    (space?: Space) => {
      setTarget({ kind: "folder", space: inSpace(space) })
      setOpen(true)
    },
    [inSpace],
  )

  return (
    <CreateDialogContext.Provider
      value={{ openCreateDrawingDialog, openCreateFolderDialog }}
    >
      {children}
      <CreateDialog open={open} onOpenChange={setOpen} target={target} />
    </CreateDialogContext.Provider>
  )
}

export function useCreateDialog() {
  const ctx = useContext(CreateDialogContext)
  if (!ctx)
    throw new Error("useCreateDialog must be used within CreateDialogProvider")
  return ctx
}
