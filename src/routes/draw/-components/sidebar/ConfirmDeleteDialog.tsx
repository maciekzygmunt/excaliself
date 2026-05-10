import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ConfirmDialog } from "./SidebarProvider"

type Props = {
  dialog: ConfirmDialog
  onClose: () => void
}

export function ConfirmDeleteDialog({ dialog, onClose }: Props) {
  const handleConfirm = async () => {
    const action = dialog?.onConfirm
    onClose()
    if (action) await action()
  }

  return (
    <AlertDialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {dialog && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
