import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { TypeToConfirmDialog } from "@/components/type-to-confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  type CurrentUser,
  deleteAccountStateQueryOptions,
  myContentCountsQueryOptions,
} from "@/features/account/queries"
import { deleteMyAccount } from "@/features/account/server"
import type { OwnedContentCounts } from "@/features/admin/delete-user"
import { describeKeptTeamDrawings } from "@/features/admin/delete-user-copy"
import { describeContents } from "@/features/trash/destroy-copy"

// The Account danger zone (issue #67, spec §4.5 tier 3): one isolated card,
// one action — hard-delete your own account and your private work (Team
// drawings stay). The sole admin is blocked with the reason inline; the
// server enforces the same guard regardless.
export function DangerZoneSection({ user }: { user: CurrentUser }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { data: state } = useQuery(deleteAccountStateQueryOptions())
  const blocked = state?.soleAdmin === true

  // Fetched only once the dialog is up — the danger copy must state what
  // will actually be destroyed, with fresh counts.
  const { data: counts, isError: countsFailed } = useQuery({
    ...myContentCountsQueryOptions(),
    enabled: confirmOpen,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteMyAccount(),
    onSuccess: () => {
      // The account and its sessions are gone; a hard navigation drops every
      // client cache along with them.
      window.location.href = "/login"
    },
    onError: () => toast.error("Couldn't delete your account"),
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
        <p className="text-xs text-muted-foreground">
          {user.teamEnabled
            ? "Irreversible. Your private work goes with the account. Team drawings stay."
            : "Irreversible. Everything you own goes with the account."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Delete account</p>
          <p className="text-xs text-muted-foreground">
            {blocked
              ? "You're the instance's only admin. Promote another member to admin before deleting your account."
              : `Permanently delete your account and all of your ${user.teamEnabled ? "private " : ""}drawings and folders.`}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          // Also disabled while the sole-admin state is still unknown — the
          // server would reject anyway; don't offer a confirm that can't land.
          disabled={!state || blocked}
          onClick={() => setConfirmOpen(true)}
        >
          Delete account
        </Button>
      </div>

      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete your account?"
        description={deleteDescription(counts, countsFailed)}
        challenge={user.email}
        confirmLabel="Delete account"
        pendingLabel="Deleting…"
        // No confirm until the copy can state real counts.
        confirmDisabled={!counts}
        onConfirm={() => deleteMutation.mutateAsync()}
      />
    </section>
  )
}

function deleteDescription(
  counts: OwnedContentCounts | undefined,
  countsFailed: boolean,
) {
  if (countsFailed)
    return "Couldn't load your content counts. Close this dialog and try again."
  if (!counts)
    return "This will delete your account and permanently delete all of your content. This can't be undone."
  const contents = describeContents(counts.drawings, counts.folders)
  const kept = describeKeptTeamDrawings("Your", counts.teamDrawings)
  const destroyed = contents
    ? `This will delete your account and permanently delete your ${contents}.`
    : `This will delete your account. You have no ${kept ? "private " : ""}drawings or folders.`
  return [destroyed, "This can't be undone.", kept].filter(Boolean).join(" ")
}
