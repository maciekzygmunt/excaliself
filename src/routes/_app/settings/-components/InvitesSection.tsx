import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { pendingInvitesQueryOptions } from "@/features/invites/queries"
import { createInvite, deleteInvite } from "@/features/invites/server"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"

// Today's invite model, unchanged (issue #64): anonymous single-use links
// with a fixed 7-day expiry that always create a Member. Copy doubles as
// resend — a pending link can be handed out again as long as it's unused.
export function InvitesSection() {
  const queryClient = useQueryClient()
  const invitesKey = pendingInvitesQueryOptions().queryKey
  const { data: invites, isPending } = useQuery(pendingInvitesQueryOptions())
  const {
    mutate: createInviteMutation,
    isPending: isCreatingInvite,
    error: createInviteError,
  } = useMutation({
    mutationFn: () => createInvite(),
    onSuccess: (data) => {
      copyInviteLink(data.token)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitesKey })
    },
  })
  const { mutate: revokeInviteMutation } = useMutation({
    mutationFn: deleteInvite,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitesKey })
    },
  })

  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), [])

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopiedToken(null), 2000)
  }

  const showSkeleton = useDelayedVisible(isPending)
  if (isPending) return showSkeleton ? <InvitesSkeleton /> : null

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Invites</h2>
          <p className="text-xs text-muted-foreground">
            Single-use links that add a member. Each expires after 7 days — copy
            a pending link to send it again.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createInviteMutation()}
          disabled={isCreatingInvite}
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {isCreatingInvite ? "Generating..." : "Generate link"}
        </Button>
      </div>

      {createInviteError?.message && (
        <p className="mb-3 text-sm text-destructive">
          {createInviteError?.message}
        </p>
      )}

      {/* Pending invites list */}
      <div>
        {invites?.map((invite, index) => (
          <div
            key={invite.id}
            className={`group flex items-center justify-between gap-3 py-2.5 ${
              index !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-muted-foreground">
                {invite.token.slice(0, 20)}...
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Expires {new Date(invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => copyInviteLink(invite.token)}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              >
                {copiedToken === invite.token ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-iris animate-in zoom-in-50 fade-in-0 duration-150 ease-out motion-reduce:animate-none" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => revokeInviteMutation({ data: invite.id })}
                className="rounded px-1.5 py-1 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-destructive"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
        {invites && invites.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground/60">
            No pending invite links
          </p>
        )}
      </div>
    </section>
  )
}

// Mirrors the loaded layout: header row with the generate action, then a
// couple of pending-invite rows.
function InvitesSkeleton() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      <div>
        {[0, 1].map((rowIndex) => (
          <div
            key={rowIndex}
            className={`flex flex-col gap-1.5 py-2.5 ${
              rowIndex !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
