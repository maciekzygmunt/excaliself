import { useNavigate } from "@tanstack/react-router"
import { Folder, Plus } from "lucide-react"
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
import { useCreateDrawing } from "@/features/drawings/mutations"
import { useCreateFolder } from "@/features/folders/mutations"
import { Kbd } from "./sidebar/Kbd"

export type FolderScope = { id: string; name: string }

export type CreateTarget =
  | { kind: "drawing"; folder?: FolderScope | null }
  | { kind: "folder" }

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
          data: { name: trimmed, folderId: target.folder?.id ?? null },
        })
        onOpenChange(false)
        navigate({ to: "/draw/$id", params: { id } })
      } else {
        await createFolderMutation.mutateAsync({
          data: { name: trimmed, parentId: null },
        })
        onOpenChange(false)
      }
    } catch {
      // Keep the dialog open so the typed name isn't lost
      toast.error(
        target.kind === "drawing"
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
        <div className="flex items-center gap-2.5 px-4 py-3.5">
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
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-4 py-2">
          {folder ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Folder className="h-3 w-3 shrink-0 fill-iris/70 text-iris" />
              in {folder.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">
              {target.kind === "drawing" ? "New drawing" : "New folder"}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <Kbd>↵</Kbd> to create
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type CreateDialogContextValue = {
  openCreateDrawingDialog: (folder?: FolderScope) => void
  openCreateFolderDialog: () => void
}

const CreateDialogContext = createContext<CreateDialogContextValue | null>(null)

export function CreateDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Kept across close so the content doesn't flip during the exit animation
  const [target, setTarget] = useState<CreateTarget>({ kind: "drawing" })

  const openCreateDrawingDialog = useCallback((folder?: FolderScope) => {
    setTarget({ kind: "drawing", folder: folder ?? null })
    setOpen(true)
  }, [])

  const openCreateFolderDialog = useCallback(() => {
    setTarget({ kind: "folder" })
    setOpen(true)
  }, [])

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
