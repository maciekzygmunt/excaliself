import { exportToSvg, restore } from "@excalidraw/excalidraw"
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
  data: string | null | undefined,
): Promise<SVGSVGElement | null> {
  if (!data) return null

  let parsed: ExcalidrawInitialDataState
  try {
    parsed = JSON.parse(data) as ExcalidrawInitialDataState
  } catch {
    return null
  }

  const elements = (parsed?.elements ?? []).filter(
    (element) => !element.isDeleted,
  )
  if (elements.length === 0) return null

  const restored = restore({ elements, appState: parsed.appState }, null, null)
  return await exportToSvg({
    elements: restored.elements,
    appState: {
      ...restored.appState,
      exportBackground: false,
      exportEmbedScene: false,
    },
    files: null,
  })
}
