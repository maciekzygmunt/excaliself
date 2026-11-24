import { useQuery } from "@tanstack/react-query"
import { Lock, type LucideIcon, Trash2, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { DangerConfirmDialog } from "@/components/danger-confirm-dialog"
import { QuietLine } from "@/components/drawing-gallery/GalleryEmpty"
import { TrashGallery } from "@/components/drawing-gallery/TrashGallery"
import { Button } from "@/components/ui/button"
import type { Space } from "@/db/schema"
import { currentUserQueryOptions } from "@/features/account/queries"
import { describeContents } from "@/features/trash/destroy-copy"
import {
  useDeleteTrashUnitForever,
  useEmptyTrash,
  useRestoreTrashedDrawing,
  useRestoreTrashedFolder,
} from "@/features/trash/mutations"
import { trashQueryOptions } from "@/features/trash/queries"
import { useDocumentTitle } from "@/lib/document-title"
import { m } from "@/paraglide/messages"
import {
  type PaletteContextSection,
  usePaletteContextSection,
} from "./CommandPalette"

// The trash surface (spec §5.11): the gallery grid in trash mode. No
// toolbar — trash is a holding pen, not a browse surface. While Team is
// enabled the page splits into a Private and a Team section; the Team
// section has no Empty trash, so one click can't wipe everyone's trash.
export function TrashPage() {
  const { data, isPending } = useQuery(trashQueryOptions())
  const { data: teamEnabled = false } = useQuery({
    ...currentUserQueryOptions(),
    select: (user) => user.teamEnabled,
  })
  const restoreDrawing = useRestoreTrashedDrawing()
  const restoreFolder = useRestoreTrashedFolder()
  const deleteForever = useDeleteTrashUnitForever()
  const emptyTrash = useEmptyTrash()
  useDocumentTitle(m.sidebar_trash(), { chrome: true })

  const units = useMemo(() => {
    const inSpace = (space: Space) => ({
      drawings: data?.drawings.filter((d) => d.space === space) ?? [],
      folders: data?.folders.filter((f) => f.space === space) ?? [],
    })
    return { private: inSpace("private"), team: inSpace("team") }
  }, [data])

  const hasPrivateUnits =
    units.private.drawings.length + units.private.folders.length > 0

  // The palette's context section here is a single row that closes into the
  // header's count-aware danger dialog — same instance, so palette and
  // header can never drift (spec §5.11); absent when there is nothing to
  // empty, like the header button.
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const section = useMemo<PaletteContextSection | null>(() => {
    if (!hasPrivateUnits) return null
    return {
      title: m.sidebar_trash(),
      rows: [
        {
          id: "trash:empty",
          label: m.trash_empty(),
          icon: Trash2,
          destructive: true,
          onSelect: () => setEmptyTrashOpen(true),
        },
      ],
    }
  }, [hasPrivateUnits])
  usePaletteContextSection(section)
  // Every Private row Empty trash would destroy, subtree members included —
  // the count-aware phrasing for the tier-2 dialog (spec §4.5).
  const totalsPhrase = data
    ? describeContents(data.totals.drawings, data.totals.folders)
    : null

  const gallery = (space: Space, empty: string) => (
    <TrashGallery
      drawings={units[space].drawings}
      folders={units[space].folders}
      isPending={isPending}
      loadingLabel={m.trash_loading()}
      onRestoreDrawing={restoreDrawing}
      onRestoreFolder={restoreFolder}
      onDeleteForever={deleteForever}
      // Tier-2 quiet line doubling as the retention disclosure — no CTA, no
      // illustration (spec §5.10).
      empty={<QuietLine>{empty}</QuietLine>}
    />
  )

  // Absent (not disabled) when there is nothing to empty — spec §5.11
  const emptyTrashButton = hasPrivateUnits && totalsPhrase && (
    <DangerConfirmDialog
      open={emptyTrashOpen}
      onOpenChange={setEmptyTrashOpen}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          {m.trash_empty()}
        </Button>
      }
      title={m.trash_empty_title()}
      description={
        teamEnabled
          ? m.trash_empty_description_private({ contents: totalsPhrase })
          : m.trash_empty_description({ contents: totalsPhrase })
      }
      confirmLabel={m.trash_empty()}
      pendingLabel={m.trash_emptying()}
      onConfirm={emptyTrash}
    />
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="flex items-center justify-between pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            {m.sidebar_trash()}
          </h1>
          {!teamEnabled && emptyTrashButton}
        </div>

        {teamEnabled ? (
          <>
            <TrashSection
              icon={Lock}
              title={m.spaces_private()}
              label={m.trash_section_private()}
              action={emptyTrashButton}
            >
              {gallery("private", m.trash_empty_state_private())}
            </TrashSection>
            <TrashSection
              icon={Users}
              title={m.spaces_team()}
              label={m.trash_section_team()}
              className="pt-10"
            >
              {gallery("team", m.trash_empty_state_team())}
            </TrashSection>
          </>
        ) : (
          gallery("private", m.trash_empty_state())
        )}
      </div>
    </div>
  )
}

/** One space's part of the Trash page: a labelled header over its grid. */
function TrashSection({
  icon: Icon,
  title,
  label,
  action,
  className,
  children,
}: {
  icon: LucideIcon
  title: string
  /** The section's accessible name, such as "Private trash". */
  label: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className={className}>
      <div className="flex min-h-8 items-center justify-between pb-3">
        <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3 w-3" strokeWidth={2.25} />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
