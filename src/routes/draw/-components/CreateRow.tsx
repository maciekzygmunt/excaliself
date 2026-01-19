import { File, Folder } from "lucide-react"
import { useSidebarContext } from "./SidebarContext"

type CreateRowProps = {
  depth: number
  parentId: string | null
}

export function CreateRow({ depth, parentId }: CreateRowProps) {
  const {
    open,
    createDraft,
    createName,
    setCreateName,
    finalizeCreate,
    cancelCreate,
    createInputRef,
  } = useSidebarContext()

  if (!createDraft || createDraft.parentId !== parentId || !open) return null
  const isDrawing = createDraft.type === "drawing"

  return (
    <div
      className="flex items-center gap-2 py-1"
      style={open ? { paddingLeft: depth * 12 + 8 } : undefined}
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        {isDrawing ? (
          <File className="h-4 w-4" />
        ) : (
          <Folder className="h-4 w-4" />
        )}
      </div>
      <input
        ref={createInputRef}
        value={createName}
        onChange={(event) => setCreateName(event.target.value)}
        onBlur={finalizeCreate}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void finalizeCreate()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            cancelCreate()
          }
        }}
        className="h-6 flex-1 rounded-sm border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}
