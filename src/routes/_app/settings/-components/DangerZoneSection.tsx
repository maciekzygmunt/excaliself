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
import {
  purgeDeviceDrawings,
  setDeviceAccount,
  supportsDeviceDrawings,
} from "@/features/offline/store"
import { describeContents } from "@/features/trash/destroy-copy"
import { m } from "@/paraglide/messages"

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
    onSuccess: async () => {
      // The account and its sessions are gone; a hard navigation drops every
      // client cache along with them. Its drawings on this device go too.
      setDeviceAccount(null)
      if (supportsDeviceDrawings())
        await purgeDeviceDrawings(user.id).catch(() => {})
      window.location.href = "/login"
    },
    onError: () => toast.error(m.settings_danger_delete_failed()),
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-destructive">
          {m.settings_danger_title()}
        </h2>
        <p className="text-xs text-muted-foreground">
          {user.teamEnabled
            ? m.settings_danger_description_team()
            : m.settings_danger_description()}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {m.settings_danger_delete()}
          </p>
          <p className="text-xs text-muted-foreground">
            {blocked
              ? m.settings_danger_sole_admin()
              : user.teamEnabled
                ? m.settings_danger_delete_hint_team()
                : m.settings_danger_delete_hint()}
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
          {m.settings_danger_delete()}
        </Button>
      </div>

      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={m.settings_danger_confirm_title()}
        description={deleteDescription(counts, countsFailed)}
        challenge={user.email}
        confirmLabel={m.settings_danger_delete()}
        pendingLabel={m.settings_deleting()}
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
  if (countsFailed) return m.settings_danger_counts_failed()
  if (!counts) return m.settings_danger_confirm_loading()
  const contents = describeContents(counts.drawings, counts.folders)
  const kept =
    counts.teamDrawings > 0 &&
    m.settings_danger_kept_team({ count: counts.teamDrawings })
  const destroyed = contents
    ? m.settings_danger_confirm_contents({ contents })
    : kept
      ? m.settings_danger_confirm_empty_team()
      : m.settings_danger_confirm_empty()
  return [destroyed, m.settings_cannot_undo(), kept].filter(Boolean).join(" ")
}
