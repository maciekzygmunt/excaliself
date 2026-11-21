import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import {
  listDeviceDrawings,
  setDeviceAccount,
  supportsDeviceDrawings,
} from "./store"
import { forgetUnheldDeviceDrawing, useDeviceSync } from "./sync"

/**
 * The signed-in app's side of offline drawings: installs the offline page,
 * syncs edits kept on this device, and drops copies of drawings that left
 * Private.
 */
export function useOfflineSupport(owner: string) {
  const supported = supportsDeviceDrawings()
  useEffect(() => {
    if (!supported) return
    setDeviceAccount(owner)
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/offline-worker.js").catch(() => {})
  }, [supported, owner])
  // A cached scene is now stale: an editor opening it would save over the
  // edits that just went up.
  const queryClient = useQueryClient()
  useDeviceSync(supported ? owner : null, (id) =>
    queryClient.removeQueries({
      queryKey: drawingQueryOptions(id).queryKey,
      exact: true,
    }),
  )

  const { data: drawings } = useQuery(drawingsQueryOptions())
  useEffect(() => {
    if (!supported || !drawings) return
    const inPrivate = new Set(
      drawings.flatMap((d) => (d.space === "private" ? [d.id] : [])),
    )
    void listDeviceDrawings(owner)
      .then((kept) =>
        Promise.all(
          kept.flatMap(({ id }) =>
            // An open editor keeps its copy; a later list change retries.
            inPrivate.has(id) ? [] : [forgetUnheldDeviceDrawing(owner, id)],
          ),
        ),
      )
      .catch(() => {})
  }, [supported, owner, drawings])
}
