import { type DragEvent, type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"
import { type ImportTarget, useImportDrawingFiles } from "./import-files"

/** Files dragged in from the computer, not an internal drawing or folder row. */
export const isFileDrag = (e: DragEvent) =>
  e.dataTransfer.types.includes("Files")

/**
 * Makes an element a drop zone for files from the computer. Spread
 * `dropProps` on it; `isOver` is true while files hover over it.
 */
export function useFileDropTarget(target: ImportTarget) {
  const importFiles = useImportDrawingFiles()
  const [isOver, setIsOver] = useState(false)

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setIsOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      // Moving onto a child also fires dragleave; keep the highlight then.
      if (
        e.relatedTarget instanceof Node &&
        e.currentTarget.contains(e.relatedTarget)
      )
        return
      setIsOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setIsOver(false)
      const files = [...e.dataTransfer.files]
      if (files.length > 0) void importFiles(files, target)
    },
  }

  return { isOver, dropProps }
}

/** A page-sized drop zone that tints while files hover over it. */
export function FileDropZone({
  target,
  className,
  children,
}: {
  target: ImportTarget
  className?: string
  children: ReactNode
}) {
  const { isOver, dropProps } = useFileDropTarget(target)
  return (
    <div
      {...dropProps}
      className={cn(
        "transition-colors",
        isOver && "bg-iris-muted ring-2 ring-inset ring-iris-ring",
        className,
      )}
    >
      {children}
    </div>
  )
}
