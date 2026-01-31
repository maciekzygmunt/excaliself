import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, LinkIcon, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createInvite, deleteInvite, getPendingInvites } from "@/server/invites"

export function InvitesCard() {
  const queryClient = useQueryClient()
  const { data: invites } = useQuery({
    queryKey: ["admin", "invites"],
    queryFn: getPendingInvites,
  })
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
      queryClient.invalidateQueries({ queryKey: ["admin", "invites"] })
    },
  })
  const { mutate: deleteInviteMutation } = useMutation({
    mutationFn: deleteInvite,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "invites"] })
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Invite Links
        </CardTitle>
        <CardDescription>Generate invite links for new users</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Button
            onClick={() => {
              createInviteMutation()
            }}
            disabled={isCreatingInvite}
          >
            <Plus className="mr-2 h-4 w-4" />
            {isCreatingInvite ? "Generating..." : "Generate Invite Link"}
          </Button>
        </div>
        {createInviteError?.message && (
          <p className="mb-4 text-sm text-destructive">
            {createInviteError?.message}
          </p>
        )}
        <div className="space-y-2">
          {invites?.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-mono text-sm text-muted-foreground">
                  {invite.token.slice(0, 16)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyInviteLink(invite.token)}
                >
                  {copiedToken === invite.token ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => deleteInviteMutation({ data: invite.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {invites && invites.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No pending invite links
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
