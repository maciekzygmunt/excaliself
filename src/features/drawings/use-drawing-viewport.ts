import type {
  AppState,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import { useCallback, useLayoutEffect, useRef } from "react"
import { z } from "zod"

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

/** The caller keys its canvas by drawing and viewer so each mount owns its view. */
export function useDrawingViewport(
  drawingId: string,
  userId: string | null,
  initialData: ExcalidrawInitialDataState | null,
) {
  const key = `excaliself:viewport:${JSON.stringify([userId, drawingId])}`
  const lastObserved = useRef<Viewport | null>(null)
  const pending = useRef<Viewport | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const viewport = pending.current
    pending.current = null
    if (!viewport) return
    try {
      window.localStorage.setItem(key, JSON.stringify(viewport))
    } catch {
      // Storage can be full or blocked. Canvas use still works normally.
    }
  }, [key])

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
      pending.current = next
      if (timer.current === null)
        timer.current = setTimeout(flush, SAVE_DELAY_MS)
    },
    [flush],
  )

  return { getInitialData, observeViewport }
}
