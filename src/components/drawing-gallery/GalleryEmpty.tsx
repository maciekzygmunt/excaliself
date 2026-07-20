import type { Folder } from "@/features/folders/queries"

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
  return <QuietLine>No drawings match “{query}”</QuietLine>
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
      <p className="text-sm text-muted-foreground">This folder is empty</p>
      {folder && (
        <button
          type="button"
          onClick={() => onCreateInFolder(folder)}
          className="mt-3 text-[13px] font-medium text-iris transition-colors duration-150 hover:text-iris-strong"
        >
          New drawing here
        </button>
      )}
    </div>
  )
}
