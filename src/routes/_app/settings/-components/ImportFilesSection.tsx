import { FileUp } from "lucide-react"
import { type DragEvent, useState } from "react"
import { useImportDrawingFiles } from "@/features/drawings/import-files"
import { cn } from "@/lib/utils"

const PRIVATE_ROOT = { folderId: null, space: "private" } as const

// Files dropped or chosen here land at the root of Private. The sidebar takes
// drops into folders and Team (use-sidebar-dnd).
export function ImportFilesSection() {
  const importFiles = useImportDrawingFiles()
  const [over, setOver] = useState(false)

  const take = (files: FileList | null) => {
    if (files && files.length > 0) void importFiles([...files], PRIVATE_ROOT)
  }
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setOver(true)
  }

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Import files</h2>
        <p className="max-w-md text-xs text-muted-foreground">
          Add .excalidraw files from your computer. They go to Private. PNG and
          SVG exports that include the scene work too. To put files in a folder
          or in Team, drop them on it in the sidebar.
        </p>
      </div>
      <label
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer.files)
        }}
        className={cn(
          "flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-xs text-muted-foreground transition-colors hover:text-foreground focus-within:ring-2 focus-within:ring-iris-ring",
          over && "border-iris-ring bg-iris-muted text-foreground",
        )}
      >
        <input
          type="file"
          multiple
          accept=".excalidraw,.json,.png,.svg"
          className="sr-only"
          onChange={(e) => {
            take(e.currentTarget.files)
            e.currentTarget.value = ""
          }}
        />
        <FileUp className="h-4 w-4" />
        Drop files here, or click to choose
      </label>
    </section>
  )
}
