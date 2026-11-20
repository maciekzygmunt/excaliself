import { useEffect } from "react"
import {
  beginSync,
  finishSync,
  listPendingDrawings,
  offlineAccount,
  subscribeToLocalDrawings,
} from "./store"
import type { SyncResult } from "./types"

const inProgress = new Map<string, Promise<void>>()

export function syncLocalDrawing(owner: string, id: string): Promise<void> {
  const key = JSON.stringify([owner, id])
  const existing = inProgress.get(key)
  if (existing) return existing

  const run = async () => {
    while (offlineAccount() === owner && navigator.onLine) {
      const drawing = await beginSync(owner, id)
      const sending = drawing?.sending
      if (drawing?.status !== "pending" || !sending) return
      const { name, baseRevision, scene, serverFileIds } = sending
      const sent = new Set(serverFileIds)
      const newFiles = scene.files.filter((file) => !sent.has(file.fileId))
      const send = async (files: typeof scene.files) => {
        const body = JSON.stringify({
          id,
          name,
          baseRevision,
          scene: { data: scene.data, files },
          owner,
        })
        // Allow time to upload the encoded image bytes on a slow connection.
        const timeout = 30_000 + Math.ceil(body.length / 131_072) * 1000
        const response = await fetch("/api/offline-drawings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeout),
        })
        if (response.status === 413) return { status: "invalid" } as const
        if (response.ok) return (await response.json()) as SyncResult
      }
      let result = await send(newFiles)
      if (result?.status === "images" && result.missingFileIds?.length) {
        const missing = new Set(result.missingFileIds)
        const resend = scene.files.filter(
          (file) => sent.has(file.fileId) && missing.has(file.fileId),
        )
        if (resend.length > 0) result = await send([...newFiles, ...resend])
      }
      if (!result) return
      const updated = await finishSync(owner, id, sending.editId, result)
      if (updated?.status !== "pending") return
    }
  }
  // A persisted request still survives a tab crash. The lock also prevents an
  // online tab and the offline workspace from submitting it simultaneously.
  const sync = (navigator.locks ? navigator.locks.request(key, run) : run())
    .catch(() => {})
    .finally(() => inProgress.delete(key))
  inProgress.set(key, sync)
  return sync
}

export function useOfflineSync(owner: string | null) {
  useEffect(() => {
    if (!owner) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    const run = async () => {
      if (running || !navigator.onLine || offlineAccount() !== owner) return
      running = true
      try {
        const keys = await listPendingDrawings(owner)
        for (const id of keys) await syncLocalDrawing(owner, id)
      } catch {
        // Storage errors are reported by the editor that initiated the write.
      } finally {
        running = false
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(run, 500)
    }
    const unsubscribe = subscribeToLocalDrawings(schedule)
    const interval = setInterval(run, 10_000)
    window.addEventListener("online", run)
    window.addEventListener("focus", run)
    void run()
    return () => {
      unsubscribe()
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener("online", run)
      window.removeEventListener("focus", run)
    }
  }, [owner])
}
