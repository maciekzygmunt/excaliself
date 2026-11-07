// The card where a member applies or discards a change their AI client
// proposed. Applying edits this tab's canvas like a person would, so the
// Room or autosave writes it, and Ctrl+Z undoes it.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToSvg,
  getCommonBounds,
  restoreElements,
} from "@excalidraw/excalidraw"
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SparklesIcon } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { isStale, withEdit } from "@/features/drawing-edits/apply"
import {
  drawingEditQueryOptions,
  type PendingDrawingEdit,
} from "@/features/drawing-edits/queries"
import { decideDrawingEdit } from "@/features/drawing-edits/server"
import type { Decision } from "@/features/drawing-edits/store"

const HIGHLIGHT = { added: "#2f9e44", changed: "#1971c2", removed: "#e03131" }
const MARKERS: Record<string, { sign: string; color: string }> = {
  Add: { sign: "+", color: HIGHLIGHT.added },
  Change: { sign: "~", color: HIGHLIGHT.changed },
  Remove: { sign: "−", color: HIGHLIGHT.removed },
}

type Props = {
  drawingId: string
  excalidrawAPI: ExcalidrawImperativeAPI | null
  theme: "light" | "dark"
}

export function DrawingEditCard({ drawingId, excalidrawAPI, theme }: Props) {
  const queryClient = useQueryClient()
  const { data: edit } = useQuery(drawingEditQueryOptions(drawingId))
  const elements = useMemo(
    () =>
      edit
        ? restoreElements(
            JSON.parse(edit.elements) as ExcalidrawElement[],
            null,
          )
        : [],
    [edit],
  )

  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      decideDrawingEdit({ data: { id: edit?.id ?? "", decision } }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: drawingEditQueryOptions(drawingId).queryKey,
      }),
  })

  if (!edit || !excalidrawAPI) return null

  const apply = async () => {
    if (isStale(excalidrawAPI.getSceneElementsIncludingDeleted(), edit.base)) {
      await decide.mutateAsync("stale")
      toast.error("The drawing changed before you applied this", {
        description: "Nothing was changed. Ask your AI client to try again.",
      })
      return
    }
    if (!(await decide.mutateAsync("applied"))) return
    excalidrawAPI.updateScene({
      // Read again: the canvas may have moved on while the click was sent.
      elements: withEdit(
        excalidrawAPI.getSceneElementsIncludingDeleted(),
        elements as OrderedExcalidrawElement[],
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }

  return (
    <div className="pointer-events-none absolute inset-x-4 top-16 z-10 flex justify-end">
      <Card
        role="dialog"
        aria-label="Proposed change"
        // Opaque: the card's gradient fades to half-transparent over the canvas.
        className="pointer-events-auto flex w-[22rem] max-w-full flex-col gap-3 bg-popover p-4"
      >
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SparklesIcon className="size-3.5" />
            {edit.client} proposes a change
          </p>
          <p className="text-sm font-medium">{edit.summary}</p>
        </div>
        <EditPreview
          excalidrawAPI={excalidrawAPI}
          edit={edit}
          elements={elements}
          theme={theme}
        />
        <ul className="flex max-h-36 flex-col gap-0.5 overflow-y-auto text-xs">
          {edit.changes.map((line, index) => {
            const marker = MARKERS[line.split(" ")[0]]
            return (
              // Lines can repeat ("Add arrow" twice), so the index keys them.
              <li key={index} className="flex gap-1.5">
                <span
                  className="w-2 shrink-0 font-mono font-semibold"
                  style={{ color: marker?.color }}
                >
                  {marker?.sign}
                </span>
                <span className="min-w-0 break-words">{line}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Nothing changes until you apply it, and you can undo it.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate("discarded")}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={decide.isPending}
            onClick={() => void apply()}
          >
            {decide.isPending && decide.variables === "applied"
              ? "Applying…"
              : "Apply"}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** The drawing after the change, with new, changed, and removed elements boxed. */
function EditPreview({
  excalidrawAPI,
  edit,
  elements,
  theme,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI
  edit: PendingDrawingEdit
  elements: readonly ExcalidrawElement[]
  theme: "light" | "dark"
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const current = excalidrawAPI.getSceneElements()
    const after = withEdit(current, elements).filter((el) => !el.isDeleted)
    const changed = new Set(elements.map(({ id }) => id))
    // A label is boxed with its container, when that changed too.
    const boxed = (element: ExcalidrawElement) =>
      !(
        element.type === "text" &&
        element.containerId &&
        changed.has(element.containerId)
      )
    const box = (element: ExcalidrawElement, color: string) => {
      const [x1, y1, x2, y2] = getCommonBounds([element])
      return {
        type: "rectangle" as const,
        x: x1 - 8,
        y: y1 - 8,
        width: x2 - x1 + 16,
        height: y2 - y1 + 16,
        strokeColor: color,
        backgroundColor: "transparent",
        strokeStyle: "dashed" as const,
        strokeWidth: 2,
        roughness: 0,
      }
    }
    const removed = new Set(
      elements.filter((el) => el.isDeleted).map(({ id }) => id),
    )
    const ghosts = current
      .filter((el) => removed.has(el.id))
      .map((el) => ({ ...el, opacity: 30 }))
    const highlights = convertToExcalidrawElements([
      ...elements
        .filter((el) => !el.isDeleted && boxed(el))
        .map((el) =>
          box(el, el.id in edit.base ? HIGHLIGHT.changed : HIGHLIGHT.added),
        ),
      ...ghosts.filter(boxed).map((el) => box(el, HIGHLIGHT.removed)),
    ])

    let cancelled = false
    void exportToSvg({
      elements: [...after, ...ghosts, ...highlights],
      appState: {
        exportBackground: false,
        exportWithDarkMode: theme === "dark",
      },
      files: excalidrawAPI.getFiles(),
      exportPadding: 12,
    }).then((svg: SVGSVGElement) => {
      if (cancelled || !ref.current) return
      svg.removeAttribute("width")
      svg.removeAttribute("height")
      // As tall as the drawing needs, up to the box.
      svg.classList.add("h-auto", "max-h-40", "w-full")
      ref.current.replaceChildren(svg)
    })
    return () => {
      cancelled = true
    }
  }, [excalidrawAPI, edit, elements, theme])

  return (
    <div
      ref={ref}
      aria-hidden
      className="flex min-h-16 items-center overflow-hidden rounded-md border border-border bg-background p-2"
    />
  )
}
