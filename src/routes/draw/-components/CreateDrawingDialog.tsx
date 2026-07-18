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
import { Kbd } from "./sidebar/Kbd"

export type FolderScope = { id: string; name: string }

type CreateDrawingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: FolderScope | null
}

export function CreateDrawingDialog({
  open,
  onOpenChange,
  folder = null,
}: CreateDrawingDialogProps) {
  const navigate = useNavigate()
  const createMutation = useCreateDrawing()
  const [name, setName] = useState("")
  // Synchronous guard against a double Enter racing ahead of isPending's
  // re-render (same pattern as the sidebar's CreateRow).
  const submittedRef = useRef(false)

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
      const id = await createMutation.mutateAsync({
        data: { name: trimmed, folderId: folder?.id ?? null },
      })
      onOpenChange(false)
      navigate({ to: "/draw/$id", params: { id } })
    } catch {
      // Keep the dialog open so the typed name isn't lost
      toast.error("Failed to create drawing")
    } finally {
      submittedRef.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[30%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <DialogTitle className="sr-only">Create drawing</DialogTitle>
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
            disabled={createMutation.isPending}
            placeholder="Drawing name…"
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
              New drawing
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

type CreateDrawingDialogContextValue = {
  openCreateDrawingDialog: (folder?: FolderScope) => void
}

const CreateDrawingDialogContext =
  createContext<CreateDrawingDialogContextValue | null>(null)

export function CreateDrawingDialogProvider({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [folder, setFolder] = useState<FolderScope | null>(null)

  const openCreateDrawingDialog = useCallback((scope?: FolderScope) => {
    setFolder(scope ?? null)
    setOpen(true)
  }, [])

  return (
    <CreateDrawingDialogContext.Provider value={{ openCreateDrawingDialog }}>
      {children}
      <CreateDrawingDialog open={open} onOpenChange={setOpen} folder={folder} />
    </CreateDrawingDialogContext.Provider>
  )
}

export function useCreateDrawingDialog() {
  const ctx = useContext(CreateDrawingDialogContext)
  if (!ctx)
    throw new Error(
      "useCreateDrawingDialog must be used within CreateDrawingDialogProvider",
    )
  return ctx
}
