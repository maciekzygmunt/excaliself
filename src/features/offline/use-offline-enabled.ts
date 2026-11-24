import { useSyncExternalStore } from "react"
import { canKeepDeviceDrawings, supportsDeviceDrawings } from "./store"

const never = () => () => {}

/** Whether offline drawings are on in this browser. False on the server. */
export const useOfflineEnabled = () =>
  useSyncExternalStore(never, supportsDeviceDrawings, () => false)

/** Whether this browser can keep drawings. Assumed on the server. */
export const useCanKeepOffline = () =>
  useSyncExternalStore(never, canKeepDeviceDrawings, () => true)
