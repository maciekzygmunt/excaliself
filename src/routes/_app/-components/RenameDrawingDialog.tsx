import { Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useRenameDrawing } from "@/features/drawings/mutations"
import { Kbd } from "./sidebar/Kbd"

type RenameDrawingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  drawing: { id: string; name: string }
}

/**
 * The standard rename dialog (spec §4.1): list surfaces like the palette are
 * never forms, so their Rename rows close into this. Saving is optimistic —
 * the dialog closes immediately; the mutation rolls the cache back and shows
 * an error toast on failure.
 */
export function RenameDrawingDialog({
  open,
  onOpenChange,
  drawing,
}: RenameDrawingDialogProps) {
  const renameMutation = useRenameDrawing()
  const [name, setName] = useState(drawing.name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // The host keeps this component mounted across opens — refill from the
  // current name on every open so a previous edit can't leak into the next
  useEffect(() => {
    if (open) setName(drawing.name)
  }, [open, drawing.name])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed !== drawing.name) {
      renameMutation.mutate({
        data: { id: drawing.id, updateData: { name: trimmed } },
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[30%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <DialogTitle className="sr-only">Rename drawing</DialogTitle>
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <Pencil className="h-4 w-4 shrink-0 text-iris" strokeWidth={2.5} />
          <input
            ref={inputRef}
            // The whole dialog exists to type a name into — focus it on
            // open, with the current name selected so typing replaces it
            autoFocus
            onFocus={() => inputRef.current?.select()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Drawing name…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-4 py-2">
          <span className="text-xs text-muted-foreground/60">
            Rename drawing
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
            <Kbd>↵</Kbd> to rename
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
