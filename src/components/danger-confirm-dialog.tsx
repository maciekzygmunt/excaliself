import { useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * Tier-2 danger dialog (spec §4.5): a count-aware, danger-styled confirm —
 * the caller words the description with exact counts. Nothing destructive
 * fires without it. The confirm is pessimistic (spec §4.3): the dialog stays
 * open with an in-button pending state until the server answers — no
 * optimistic removal, no blocking overlay. While pending, closing is locked
 * so the outcome is never ambiguous.
 */
export function DangerConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  confirmDisabled = false,
  onConfirm,
}: {
  /** Rendered via asChild — must accept button props (a plain element works). */
  trigger: React.ReactNode
  title: string
  description: React.ReactNode
  confirmLabel: string
  /** In-button pending state, e.g. "Deleting…". */
  pendingLabel: string
  /**
   * Blocks the confirm button (not the dialog) while the caller can't yet
   * word a count-aware description — e.g. the unit's counts are still
   * loading. Cancel stays available.
   */
  confirmDisabled?: boolean
  /**
   * Awaited on confirm. Resolution closes the dialog; rejection keeps it
   * open for retry — surface the error via toast in the mutation itself.
   */
  onConfirm: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch {
      // Stay open — the mutation's error toast explains, and the intent
      // ("destroy this") is still live for a retry or a cancel.
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || confirmDisabled}
            onClick={confirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
