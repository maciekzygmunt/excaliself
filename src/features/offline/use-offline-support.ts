import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import {
  forgetDeviceDrawing,
  listDeviceDrawings,
  setDeviceAccount,
  supportsDeviceDrawings,
} from "./store"
import { useDeviceSync } from "./sync"

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
  useDeviceSync(supported ? owner : null)

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
            inPrivate.has(id) ? [] : [forgetDeviceDrawing(owner, id)],
          ),
        ),
      )
      .catch(() => {})
  }, [supported, owner, drawings])
}
