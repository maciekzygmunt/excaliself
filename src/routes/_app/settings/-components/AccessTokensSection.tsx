import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type AccessToken,
  accessTokensQueryOptions,
} from "@/features/access-tokens/queries"
import { createToken, revokeToken } from "@/features/access-tokens/server"
import { useCopy } from "@/hooks/use-copy"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { formatAgo } from "@/lib/relative-time"
import { m } from "@/paraglide/messages"

// Access tokens: how a member connects their own AI client to the MCP
// endpoint. A token is shown once, in the dialog that makes it.
export function AccessTokensSection() {
  const { data: tokens, isPending } = useQuery(accessTokensQueryOptions())
  const showSkeleton = useDelayedVisible(isPending)
  const [creating, setCreating] = useState(false)

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            {m.settings_tokens_title()}
          </h2>
          <p className="text-xs text-muted-foreground">
            {m.settings_tokens_description()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreating(true)}
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          {m.settings_tokens_new()}
        </Button>
      </div>

      {isPending ? (
        showSkeleton ? (
          <TokensSkeleton />
        ) : null
      ) : (
        tokens && <TokenList tokens={tokens} />
      )}
      <NewTokenDialog open={creating} onOpenChange={setCreating} />
    </section>
  )
}

function TokenList({ tokens }: { tokens: AccessToken[] }) {
  const queryClient = useQueryClient()
  const tokensKey = accessTokensQueryOptions().queryKey
  const { mutate: revoke } = useMutation({
    mutationFn: revokeToken,
    onMutate: async ({ data }) => {
      await queryClient.cancelQueries({ queryKey: tokensKey })
      queryClient.setQueryData<AccessToken[]>(tokensKey, (list) =>
        list?.filter((token) => token.id !== data.id),
      )
    },
    onError: () => toast.error(m.settings_tokens_revoke_failed()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokensKey }),
  })

  if (tokens.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground/60">
        {m.settings_tokens_empty()}
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {tokens.map((token) => (
        <li
          key={token.id}
          className="flex items-center gap-3 px-4 py-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {token.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {token.start}…
              </span>
            </div>
            {/* Server and client can straddle a minute boundary */}
            <p
              suppressHydrationWarning
              className="truncate text-xs text-muted-foreground"
            >
              {m.settings_tokens_created({ ago: formatAgo(token.createdAt) })} ·{" "}
              {token.lastUsedAt
                ? m.settings_last_used({ ago: formatAgo(token.lastUsedAt) })
                : m.settings_never_used()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => revoke({ data: { id: token.id } })}
          >
            {m.settings_revoke()}
          </Button>
        </li>
      ))}
    </ul>
  )
}

// Two steps in one dialog: name the token, then copy it. Closing drops it
// from memory for good.
function NewTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const create = useMutation({
    mutationFn: createToken,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: accessTokensQueryOptions().queryKey,
      }),
  })
  const token = create.data?.token

  const close = () => onOpenChange(false)
  const submit = () => {
    const trimmed = name.trim()
    if (trimmed && !create.isPending) create.mutate({ data: { name: trimmed } })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // After the exit animation, so the token stays put while it fades.
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return
        setName("")
        create.reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>{m.settings_tokens_copy_title()}</DialogTitle>
              <DialogDescription>
                {m.settings_tokens_copy_description()}
              </DialogDescription>
            </DialogHeader>
            <CopyBox label={m.settings_tokens_token_label()} value={token} />
            <CopyBox
              label={m.settings_tokens_claude_code_label()}
              value={`claude mcp add --transport http excaliself ${window.location.origin}/api/mcp --header "Authorization: Bearer ${token}"`}
            />
            <DialogFooter>
              <Button size="sm" onClick={close}>
                {m.settings_done()}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <DialogHeader>
              <DialogTitle>{m.settings_tokens_new_title()}</DialogTitle>
              <DialogDescription>
                {m.settings_tokens_new_description()}
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="token-name">
                {m.settings_tokens_name_label()}
              </FieldLabel>
              <Input
                id="token-name"
                autoFocus
                value={name}
                maxLength={100}
                placeholder={m.settings_tokens_name_placeholder()}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {create.error && (
              <p className="text-sm text-destructive">
                {m.settings_tokens_create_failed()}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={close}>
                {m.settings_cancel()}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || create.isPending}
              >
                {create.isPending
                  ? m.settings_tokens_creating()
                  : m.settings_tokens_create()}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy()

  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2 rounded-md bg-well px-3 py-2 shadow-well">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={() => copy(value)}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-iris animate-in zoom-in-50 fade-in-0 duration-150 ease-out motion-reduce:animate-none" />
              {m.settings_copied()}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {m.settings_copy()}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// Mirrors the loaded layout: one token row.
function TokensSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-3.5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-56 motion-reduce:animate-none" />
      </div>
    </div>
  )
}
