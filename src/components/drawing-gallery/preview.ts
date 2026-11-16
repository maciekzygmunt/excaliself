import {
  exportScene,
  getNonDeletedElements,
  restoreElements,
} from "@excalidraw/excalidraw"
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types"

/**
 * Render a stored scene to an SVG for a Home card, from the scene JSON the
 * drawings-list query already ships — no extra requests. Embedded image files
 * are not in the list payload, so image elements come out as empty frames.
 *
 * Returns null when the scene is empty or unparseable so the card can fall
 * back to a placeholder.
 */
export async function renderPreviewSvg(
  data: string,
): Promise<SVGSVGElement | null> {
  if (!data) return null

  let parsed: ExcalidrawInitialDataState
  try {
    parsed = JSON.parse(data) as ExcalidrawInitialDataState
  } catch {
    return null
  }

  const elements = getNonDeletedElements(
    restoreElements(parsed?.elements, null),
  )
  if (elements.length === 0) return null

  return await exportScene({
    type: "svg",
    data: { elements, files: null },
    config: { canvasBackgroundColor: false },
  })
}
