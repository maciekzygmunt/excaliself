import { useEffect, useId, useState } from "react"
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
import { Input } from "@/components/ui/input"

/**
 * Tier-3 danger dialog (spec §4.5): the tier-2 count-aware confirm plus a
 * type-to-confirm challenge — the confirm button stays dead until the exact
 * challenge string (the target's email) is typed. Controlled by the caller
 * so it can be launched from a dropdown menu item. Same pessimistic contract
 * as DangerConfirmDialog: in-button pending state, close locked while
 * pending, rejection keeps it open for retry.
 */
export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  challenge,
  confirmLabel,
  pendingLabel,
  confirmDisabled = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  /** The exact string that must be typed to arm the confirm button. */
  challenge: string
  confirmLabel: string
  /** In-button pending state, e.g. "Deleting…". */
  pendingLabel: string
  /**
   * Blocks the confirm button (not the dialog) while the caller can't yet
   * word a count-aware description — e.g. the counts are still loading.
   */
  confirmDisabled?: boolean
  /**
   * Awaited on confirm. Resolution closes the dialog; rejection keeps it
   * open for retry — surface the error via toast in the mutation itself.
   */
  onConfirm: () => Promise<unknown>
}) {
  const inputId = useId()
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)

  // Every open starts from a blank challenge — a prior armed state must
  // never survive into the next confirmation.
  useEffect(() => {
    if (open) setTyped("")
  }, [open])

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Stay open — the mutation's error toast explains, and the intent
      // is still live for a retry or a cancel.
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label
            htmlFor={inputId}
            className="block text-sm text-muted-foreground"
          >
            To confirm, type{" "}
            <span className="font-medium text-foreground">{challenge}</span>{" "}
            below
          </label>
          <Input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || confirmDisabled || typed !== challenge}
            onClick={confirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
