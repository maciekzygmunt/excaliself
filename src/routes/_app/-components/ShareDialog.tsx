// The member-side share surface (canvas-sharing spec §1.2): a Share button in
// Excalidraw's top-right island opening the sectioned centered modal — link
// row, audience radio cards, Stop / Regenerate footer. UI ported from the
// winning prototype variant B (prototype/canvas-sharing-ux).

import { useQuery } from "@tanstack/react-query"
import { Check, Copy, Link2, RefreshCw, Share2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useCreateShare,
  useRegenerateShareToken,
  useSetShareAudience,
  useStopSharing,
} from "@/features/shares/mutations"
import {
  type Share,
  shareQueryOptions,
  shareUrl,
} from "@/features/shares/queries"
import { cn } from "@/lib/utils"

type Audience = Share["audience"]

const AUDIENCE_COPY: Record<Audience, { label: string; hint: string }> = {
  members: {
    label: "Members of this instance",
    hint: "Visitors must sign in before they can open it.",
  },
  anyone: {
    label: "Anyone with the link",
    hint: "No account needed — guests pick a display name.",
  },
}

export function ShareButton({ drawingId }: { drawingId: string }) {
  const [open, setOpen] = useState(false)
  const { data: share } = useQuery(shareQueryOptions(drawingId))

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Share2 className="h-3.5 w-3.5" />
        Share
        {share && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </Button>
      <ShareDialog
        drawingId={drawingId}
        open={open}
        onOpenChange={setOpen}
        share={share ?? null}
      />
    </>
  )
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
    copy: () => {
      navigator.clipboard?.writeText(url)
      setCopied(true)
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
  disabled,
}: {
  value: Audience
  onChange: (a: Audience) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {(["members", "anyone"] as const).map((a) => (
        <label
          key={a}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
            value === a
              ? "border-iris bg-iris-muted/50"
              : "border-border/60 hover:border-border",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <input
            type="radio"
            name="share-audience"
            checked={value === a}
            disabled={disabled}
            onChange={() => onChange(a)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              value === a ? "border-iris" : "border-muted-foreground/40",
            )}
          >
            {value === a && <span className="h-2 w-2 rounded-full bg-iris" />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">
              {AUDIENCE_COPY[a].label}
            </span>
            <span className="text-xs text-muted-foreground">
              {AUDIENCE_COPY[a].hint}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

function ShareDialog({
  drawingId,
  open,
  onOpenChange,
  share,
}: {
  drawingId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  share: Share | null
}) {
  // Audience is pickable before the link exists (spec §1.2); the draft only
  // matters while unshared — once a share exists the server row is the truth.
  const [draftAudience, setDraftAudience] = useState<Audience>("members")
  const createMutation = useCreateShare(drawingId)
  const stopMutation = useStopSharing(drawingId)
  const regenerateMutation = useRegenerateShareToken(drawingId)
  const audienceMutation = useSetShareAudience(drawingId)

  const audience = share ? share.audience : draftAudience
  const setAudience = (a: Audience) => {
    if (share) audienceMutation.mutate(a)
    else setDraftAudience(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="px-5 pt-5 pb-1">
          <DialogTitle>Share drawing</DialogTitle>
          <DialogDescription className="mt-1">
            {share
              ? "Everyone with this link can edit, live."
              : "Create a link that lets others edit this drawing with you, live."}
          </DialogDescription>
        </div>
        <div className="space-y-4 px-5 py-4">
          {share && <LinkRow url={shareUrl(share.token)} />}
          <AudienceCards value={audience} onChange={setAudience} />
          {!share && (
            <Button
              onClick={() => createMutation.mutate(draftAudience)}
              disabled={createMutation.isPending}
              className="w-full gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              {createMutation.isPending
                ? "Creating link…"
                : "Create share link"}
            </Button>
          )}
        </div>
        {share && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              {stopMutation.isPending ? "Stopping…" : "Stop sharing"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
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
