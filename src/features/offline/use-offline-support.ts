import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import { getLocale } from "@/paraglide/runtime"
import {
  listDeviceDrawings,
  renameDeviceDrawing,
  setDeviceAccount,
  supportsDeviceDrawings,
} from "./store"
import { forgetUnheldDeviceDrawing, useDeviceSync } from "./sync"

/**
 * The signed-in app's side of offline drawings: installs the offline page,
 * syncs edits kept on this device, renames copies with their drawings, and
 * drops copies of drawings that left Private.
 */
export function useOfflineSupport(owner: string) {
  const supported = supportsDeviceDrawings()
  useEffect(() => {
    if (!supported) return
    setDeviceAccount(owner)
    // The language rides in the URL, so a new pick installs a fresh page.
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register(`/offline-worker.js?lang=${getLocale()}`)
        .catch(() => {})
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
    const names = new Map(
      drawings.flatMap((d) => (d.space === "private" ? [[d.id, d.name]] : [])),
    )
    void listDeviceDrawings(owner)
      .then((kept) =>
        Promise.all(
          kept.flatMap(({ id, name }) => {
            const listed = names.get(id)
            // An open editor keeps its copy; a later list change retries.
            if (listed === undefined)
              return [forgetUnheldDeviceDrawing(owner, id)]
            return listed === name
              ? []
              : [renameDeviceDrawing(owner, id, listed)]
          }),
        ),
      )
      .catch(() => {})
  }, [supported, owner, drawings])
}
