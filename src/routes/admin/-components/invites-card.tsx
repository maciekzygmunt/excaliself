import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { pendingInvitesQueryOptions } from "@/features/auth/queries"
import { createInvite, deleteInvite } from "@/features/auth/server"

export function InvitesSection() {
  const queryClient = useQueryClient()
  const invitesKey = pendingInvitesQueryOptions().queryKey
  const { data: invites } = useQuery(pendingInvitesQueryOptions())
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
  const { mutate: deleteInviteMutation } = useMutation({
    mutationFn: deleteInvite,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitesKey })
    },
  })

  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`
    navigator.clipboard.writeText(link)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <section>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Invite links</h2>
          <p className="text-xs text-muted-foreground">
            Generate links to invite new users
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createInviteMutation()}
          disabled={isCreatingInvite}
          className="h-7 gap-1 px-2.5 text-xs"
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

      {/* Invites list */}
      <div>
        {invites?.map((invite, index) => (
          <div
            key={invite.id}
            className={`group flex items-center justify-between py-2.5 ${
              index !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">
                {invite.token.slice(0, 20)}...
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Expires {new Date(invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => copyInviteLink(invite.token)}
                className="rounded p-1 text-muted-foreground/40 transition-all hover:bg-muted hover:text-foreground"
              >
                {copiedToken === invite.token ? (
                  <Check className="h-3.5 w-3.5 text-notion-terracotta" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => deleteInviteMutation({ data: invite.id })}
                className="rounded p-1 text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
