import type { Folder } from "@/features/folders/queries"
import { m } from "@/paraglide/messages"

/** Tier-2 "container is empty" line (spec §5.10): quiet, no illustration. */
export function QuietLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** Tier-2 line for empty search results — one string, shared by every
 * surface with on-page search (spec §5.10). */
export function NoMatches({ query }: { query: string }) {
  return <QuietLine>{m.gallery_no_matches({ query })}</QuietLine>
}

/** The empty-folder tier-2 state: quiet line + its contextual create action. */
export function FolderEmpty({
  folder,
  onCreateInFolder,
}: {
  /** Undefined when the scoped folder vanished mid-render — action hidden. */
  folder: Folder | undefined
  onCreateInFolder: (folder: Folder) => void
}) {
  return (
    <div className="flex flex-col items-center py-16">
      <p className="text-sm text-muted-foreground">
        {m.gallery_folder_empty()}
      </p>
      {folder && (
        <button
          type="button"
          onClick={() => onCreateInFolder(folder)}
          className="mt-3 text-[13px] font-medium text-iris transition-colors duration-150 hover:text-iris-strong"
        >
          {m.gallery_folder_empty_create()}
        </button>
      )}
    </div>
  )
}

/** Tier-2 state of an empty Team space, with its create action. */
export function TeamEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center py-16">
      <p className="text-sm text-muted-foreground">{m.gallery_team_empty()}</p>
      <button
        type="button"
        onClick={() => onCreate()}
        className="mt-3 text-[13px] font-medium text-iris transition-colors duration-150 hover:text-iris-strong"
      >
        {m.gallery_team_empty_create()}
      </button>
    </div>
  )
}
