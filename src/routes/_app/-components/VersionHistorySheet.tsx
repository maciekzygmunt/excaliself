import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { renderPreviewSvg } from "@/components/drawing-gallery/preview"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  drawingsQueryOptions,
  drawingVersionSceneQueryOptions,
  drawingVersionsQueryOptions,
} from "@/features/drawings/queries"
import { restoreDrawingVersion } from "@/features/drawings/server"
import { formatAgo } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

const formatWhen = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

type Props = {
  drawingId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The drawing's past versions, each restorable as a new Private drawing. */
export function VersionHistorySheet({ drawingId, open, onOpenChange }: Props) {
  const { data: versions } = useQuery({
    ...drawingVersionsQueryOptions(drawingId),
    enabled: open,
  })
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? versions?.[0]?.id ?? null

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const restore = useMutation({
    mutationFn: restoreDrawingVersion,
    onSuccess: (id) => {
      void queryClient.invalidateQueries(drawingsQueryOptions())
      onOpenChange(false)
      toast.success("Restored as a copy in Private")
      void navigate({ to: "/draw/$id", params: { id } })
    },
    onError: () => toast.error("Failed to restore the version"),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>
            Your edits save on their own. This list also keeps earlier versions
            of the drawing:
          </SheetDescription>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground text-sm">
            <li>
              When you edit again after a break of 10 minutes or more, the
              drawing as you left it.
            </li>
            <li>Every 30 minutes while you edit.</li>
            <li>Only the last 50 versions are kept.</li>
          </ul>
        </SheetHeader>
        {versions?.length === 0 && (
          <p className="px-4 text-muted-foreground text-sm">
            No versions yet. The first one is kept when you come back to edit
            after a break.
          </p>
        )}
        {selected && (
          // Remounted per version, so a stale preview never shows while loading.
          <VersionPreview key={selected} versionId={selected} />
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto px-2">
          {versions?.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => setPicked(version.id)}
                aria-current={version.id === selected}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  version.id === selected && "bg-accent",
                )}
              >
                <span>{formatWhen.format(new Date(version.savedAt))}</span>
                <span className="text-muted-foreground text-xs">
                  {formatAgo(version.savedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <SheetFooter>
          <Button
            disabled={!selected || restore.isPending}
            onClick={() => selected && restore.mutate({ data: selected })}
          >
            {restore.isPending ? "Restoring…" : "Restore as a copy"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function VersionPreview({ versionId }: { versionId: string }) {
  const { data } = useQuery(drawingVersionSceneQueryOptions(versionId))
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data === undefined) return
    let cancelled = false
    renderPreviewSvg(data ?? "")
      .then((svg) => {
        if (!cancelled) containerRef.current?.replaceChildren(svg ?? "")
      })
      .catch(() => {
        if (!cancelled) containerRef.current?.replaceChildren()
      })
    return () => {
      cancelled = true
    }
  }, [data])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Preview of the selected version"
      // Same dark-mode re-tint as the gallery cards.
      className="mx-4 aspect-[4/3] shrink-0 rounded-md border border-border/60 p-2 dark:[filter:invert(93%)_hue-rotate(180deg)] [&_svg]:h-full [&_svg]:w-full"
    />
  )
}
