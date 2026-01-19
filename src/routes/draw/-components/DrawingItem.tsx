import { Link } from "@tanstack/react-router"
import { File, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { type Drawing, useSidebarContext } from "./SidebarContext"

type DrawingItemProps = {
  item: Drawing
  depth: number
}

export function DrawingItem({ item, depth }: DrawingItemProps) {
  const { currentDrawingId, open, onDragStart, onDragEnd, onDeleteDrawing } =
    useSidebarContext()

  const isActive = item.id === currentDrawingId

  return (
    <div
      className="group flex items-center gap-0.5 py-0.5"
      style={open ? { paddingLeft: depth * 12 + 4 } : undefined}
    >
      <Link
        to="/draw/$id"
        params={{ id: item.id }}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          !open && "justify-center px-0",
        )}
        draggable={open}
        onDragStart={onDragStart({ type: "drawing", id: item.id })}
        onDragEnd={onDragEnd}
      >
        <File className="h-4 w-4 shrink-0" />
        {open && <span className="truncate">{item.name}</span>}
      </Link>
      {open && (
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void onDeleteDrawing(item.id)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete drawing</span>
        </button>
      )}
    </div>
  )
}
