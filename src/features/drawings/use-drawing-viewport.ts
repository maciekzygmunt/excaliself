import type {
  AppState,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import { useCallback, useLayoutEffect, useRef } from "react"
import { z } from "zod"
import { useDebounceCallback } from "@/hooks/use-debounce-callback"

const viewportSchema = z.object({
  scrollX: z.number(),
  scrollY: z.number(),
  zoom: z.number().positive(),
})
type Viewport = z.infer<typeof viewportSchema>
const SAVE_DELAY_MS = 200

function readViewport(key: string) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null
      ? undefined
      : viewportSchema.safeParse(JSON.parse(raw)).data
  } catch {
    return undefined
  }
}

/**
 * Remembers this browser's last pan and zoom for a drawing. The caller keys
 * its canvas by drawing, passes `getInitialData` to Excalidraw, and calls
 * `observeViewport` from `onChange`.
 */
export function useDrawingViewport(
  drawingId: string,
  initialData: ExcalidrawInitialDataState | null,
) {
  const key = `excaliself:viewport:${drawingId}`
  const lastObserved = useRef<Viewport | null>(null)
  const { run: save, flush } = useDebounceCallback((viewport: Viewport) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(viewport))
    } catch {
      // Storage can be full or blocked. Canvas use still works normally.
    }
  }, SAVE_DELAY_MS)

  useLayoutEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", flushWhenHidden)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden)
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [flush])

  // Read at canvas mount, after the previous canvas has flushed on navigation.
  const getInitialData = useCallback(() => {
    const viewport = readViewport(key)
    if (!initialData || !viewport) return initialData
    return {
      ...initialData,
      appState: {
        ...initialData.appState,
        scrollX: viewport.scrollX,
        scrollY: viewport.scrollY,
        // Excalidraw normalizes the stored number as it restores initialData.
        zoom: { value: viewport.zoom as AppState["zoom"]["value"] },
      },
    }
  }, [initialData, key])

  const observeViewport = useCallback(
    ({
      scrollX,
      scrollY,
      zoom,
      userToFollow,
    }: Pick<AppState, "scrollX" | "scrollY" | "zoom" | "userToFollow">) => {
      const previous = lastObserved.current
      if (
        previous?.scrollX === scrollX &&
        previous.scrollY === scrollY &&
        previous.zoom === zoom.value
      )
        return

      const next = { scrollX, scrollY, zoom: zoom.value }
      lastObserved.current = next
      // Excalidraw's first onChange is the initialized view. Followed views
      // update the baseline too, so merely unfollowing doesn't save them.
      if (!previous || userToFollow) return
      save(next)
    },
    [save],
  )

  return { getInitialData, observeViewport }
}
