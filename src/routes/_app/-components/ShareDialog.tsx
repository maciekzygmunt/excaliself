// The owner's share dialog (canvas sharing spec §1.2) — the winning
// sectioned centered modal from the UX prototype (variant B, branch
// prototype/canvas-sharing-ux). Unshared: audience pickable before the link
// exists + full-width create. Shared: link row with copy feedback, audience
// radio cards, Stop / Regenerate footer.

import { useQuery } from "@tanstack/react-query"
import { Check, Copy, Link2, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ShareAudience } from "@/features/shares/access"
import {
  useCreateShare,
  useRegenerateShare,
  useSetShareAudience,
  useStopSharing,
} from "@/features/shares/mutations"
import { drawingShareQueryOptions } from "@/features/shares/queries"
import { cn } from "@/lib/utils"

const AUDIENCE_COPY: Record<ShareAudience, { label: string; hint: string }> = {
  members: {
    label: "Members of this instance",
    hint: "Visitors must sign in before they can open it.",
  },
  anyone: {
    label: "Anyone with the link",
    hint: "No account needed — guests pick a display name.",
  },
}

/**
 * execCommand fallback for the async clipboard API, which is unavailable on
 * insecure origins — a real deployment mode for a self-hosted app served
 * over plain HTTP on a LAN.
 */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

function useCopy(url: string) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])
  return {
    copied,
    // "Copied" only after a copy actually landed — a false confirmation
    // here means the owner walks away having shared nothing.
    copy: async () => {
      let ok = false
      if (navigator.clipboard) {
        ok = await navigator.clipboard.writeText(url).then(
          () => true,
          () => false,
        )
      }
      if (!ok) ok = legacyCopy(url)
      if (ok) setCopied(true)
      else toast.error("Couldn't copy the link — select and copy it manually")
    },
  }
}

function LinkRow({ url }: { url: string }) {
  const { copied, copy } = useCopy(url)
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1 pl-3">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={copy}
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

function AudienceCards({
  value,
  onChange,
  disabled = false,
}: {
  value: ShareAudience
  onChange: (audience: ShareAudience) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {(["members", "anyone"] as const).map((audience) => (
        <label
          key={audience}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
            value === audience
              ? "border-iris bg-iris-muted/50"
              : "border-border/60 hover:border-border",
            disabled && "cursor-default opacity-70",
          )}
        >
          <input
            type="radio"
            name="share-audience"
            checked={value === audience}
            disabled={disabled}
            onChange={() => onChange(audience)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              value === audience ? "border-iris" : "border-muted-foreground/40",
            )}
          >
            {value === audience && (
              <span className="h-2 w-2 rounded-full bg-iris" />
            )}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">
              {AUDIENCE_COPY[audience].label}
            </span>
            <span className="text-xs text-muted-foreground">
              {AUDIENCE_COPY[audience].hint}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

type Props = {
  drawingId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareDialog({ drawingId, open, onOpenChange }: Props) {
  const { data: share } = useQuery(drawingShareQueryOptions(drawingId))
  const createMutation = useCreateShare(drawingId)
  const stopMutation = useStopSharing(drawingId)
  const regenerateMutation = useRegenerateShare(drawingId)
  const audienceMutation = useSetShareAudience(drawingId)

  // One flag gates every control: the mutations write the same cache entry,
  // and letting them race (Stop while Regenerate is in flight) can leave the
  // dialog showing a link or audience the database no longer has.
  const busy =
    createMutation.isPending ||
    stopMutation.isPending ||
    regenerateMutation.isPending ||
    audienceMutation.isPending

  // The audience is pickable before the link exists; this local choice seeds
  // the create call. Reset each time the dialog opens so a stale pick from a
  // previous visit doesn't leak into a fresh one.
  const [draftAudience, setDraftAudience] = useState<ShareAudience>("members")
  const handleOpenChange = (next: boolean) => {
    if (next) setDraftAudience("members")
    onOpenChange(next)
  }

  // undefined = share state still loading; keep the dialog closed-looking
  // rather than flashing the unshared layout at an already-shared drawing.
  if (share === undefined) return null

  const shared = share !== null
  const url = shared ? `${window.location.origin}/share/${share.token}` : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {/* min-w-0 on every section: DialogContent is a grid, and grid
            items' default min-width:auto would let the long token URL push
            the layout wider than the panel instead of truncating. */}
        <div className="min-w-0 px-5 pt-5 pb-1">
          <DialogTitle>Share drawing</DialogTitle>
          <DialogDescription className="mt-1">
            {shared
              ? "Everyone with this link can edit, live."
              : "Create a link that lets others edit this drawing with you, live."}
          </DialogDescription>
        </div>
        <div className="min-w-0 space-y-4 px-5 py-4">
          {shared && url && <LinkRow key={share.token} url={url} />}
          <AudienceCards
            value={shared ? share.audience : draftAudience}
            disabled={shared && busy}
            onChange={(audience) =>
              shared
                ? audienceMutation.mutate(audience)
                : setDraftAudience(audience)
            }
          />
          {!shared && (
            <Button
              onClick={() => createMutation.mutate(draftAudience)}
              disabled={busy}
              className="w-full gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create share link"}
            </Button>
          )}
        </div>
        {shared && (
          <div className="flex min-w-0 items-center justify-between border-t border-border/60 bg-muted/40 px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              {stopMutation.isPending ? "Stopping…" : "Stop sharing"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={busy}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {regenerateMutation.isPending
                ? "Regenerating…"
                : "Regenerate link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
