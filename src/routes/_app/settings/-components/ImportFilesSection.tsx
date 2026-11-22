import { FileUp } from "lucide-react"
import { useFileDropTarget } from "@/features/drawings/file-drop"
import { useImportDrawingFiles } from "@/features/drawings/import-files"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const PRIVATE_ROOT = { folderId: null, space: "private" } as const

// Files dropped or chosen here land at the root of Private. Home, folder
// pages and the sidebar take drops into other targets.
export function ImportFilesSection() {
  const importFiles = useImportDrawingFiles()
  const { isOver, dropProps } = useFileDropTarget(PRIVATE_ROOT)

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          {m.settings_import_files_title()}
        </h2>
        <p className="max-w-md text-xs text-muted-foreground">
          {m.settings_import_files_description()}
        </p>
      </div>
      <label
        {...dropProps}
        className={cn(
          "flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-xs text-muted-foreground transition-colors hover:text-foreground focus-within:ring-2 focus-within:ring-iris-ring",
          isOver && "border-iris-ring bg-iris-muted text-foreground",
        )}
      >
        <input
          type="file"
          multiple
          accept=".excalidraw,.json,.png,.svg"
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])]
            if (files.length > 0) void importFiles(files, PRIVATE_ROOT)
            e.currentTarget.value = ""
          }}
        />
        <FileUp className="h-4 w-4" />
        {m.settings_import_files_drop()}
      </label>
    </section>
  )
}
