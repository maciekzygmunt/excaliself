// Uploads device drawings with unsaved edits. An editor holds its drawing
// while open, so a sync never uploads one underneath it: the online editor
// saves its own edits, and the offline page's open drawing waits until it
// closes.

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { MAX_NAME_LENGTH } from "@/features/drawings/list-columns"
import { sceneRevision } from "@/features/drawings/scene-revision"
import { syncDeviceDrawing } from "./server"
import {
  deviceDrawingStatus,
  forgetDeviceDrawing,
  listPendingDeviceDrawings,
  markDeviceDrawingSaved,
  moveToNewDeviceDrawing,
  readDeviceDrawing,
} from "./store"

const lockName = (owner: string, id: string) =>
  `excaliself:offline-drawing:${owner}:${id}`

/** Marks a drawing open in an editor until `release`. */
export function holdDeviceDrawing(owner: string, id: string) {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const granted = new Promise<void>((resolve) => {
    navigator.locks
      .request(lockName(owner, id), { mode: "shared" }, () => {
        resolve()
        return held
      })
      .catch(() => {})
  })
  return { granted, release }
}

/** Drops a clean copy, unless an editor has it open. */
export const forgetUnheldDeviceDrawing = (owner: string, id: string) =>
  navigator.locks.request(lockName(owner, id), { ifAvailable: true }, (lock) =>
    lock ? forgetDeviceDrawing(owner, id) : undefined,
  )

/**
 * "failed": unreachable, signed out, or refused; the edits stay pending.
 * "copied": the server version moved on, so the edits went up as `copyName`.
 */
export type SyncOutcome =
  | { status: "synced" | "failed" | "busy" | "clean" }
  | { status: "copied"; name: string; copyName: string }

export function toastCopied(copied: { name: string; copyName: string }) {
  toast(`“${copied.name}” changed elsewhere`, {
    id: `offline-copy:${copied.copyName}`,
    description: `Your offline edits are saved as “${copied.copyName}”.`,
  })
}

async function upload(owner: string, id: string): Promise<SyncOutcome> {
  const drawing = await readDeviceDrawing(owner, id)
  if (drawing?.status !== "pending") return { status: "clean" }
  const { name, baseRevision, data } = drawing
  let result: Awaited<ReturnType<typeof syncDeviceDrawing>>
  try {
    result = await syncDeviceDrawing({
      data: {
        owner,
        id,
        name,
        baseRevision,
        data,
        files: drawing.files.map(({ fileId, dataUrl }) => ({
          fileId,
          dataUrl,
        })),
      },
    })
  } catch {
    return { status: "failed" }
  }
  if (result.status === "wrong-account") return { status: "failed" }
  if (result.status === "saved") {
    await markDeviceDrawingSaved(
      owner,
      id,
      { data, fileIds: drawing.files.map((file) => file.fileId) },
      await sceneRevision(data),
      drawing.writer,
    )
    // As online: refused images aren't kept, so say so.
    if (result.missingFileIds.length + result.overCapFileIds.length > 0)
      toast.error(`Some images in “${name}” weren’t saved`, {
        id: `offline-images:${id}`,
        description: "They were too large to store with the drawing.",
      })
    return { status: "synced" }
  }
  // Changed elsewhere, shared, moved to Team, or trashed: keep both versions.
  const suffix = " (offline copy)"
  const copyName = `${name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`
  const copy = await moveToNewDeviceDrawing(owner, id, copyName)
  if (!copy) return { status: "clean" }
  // Pending until it goes up; a later sync retries it.
  await syncDeviceDrawingNow(owner, copy.id)
  return { status: "copied", name, copyName }
}

/**
 * Uploads one drawing's pending edits unless an editor holds it. With
 * `waitMs`, waits that long for the editor to let go.
 */
export async function syncDeviceDrawingNow(
  owner: string,
  id: string,
  waitMs?: number,
): Promise<SyncOutcome> {
  try {
    // Checked first, so an editor open in another tab costs no wait.
    if ((await deviceDrawingStatus(owner, id)) !== "pending")
      return { status: "clean" }
    return await navigator.locks.request(
      lockName(owner, id),
      waitMs ? { signal: AbortSignal.timeout(waitMs) } : { ifAvailable: true },
      (lock): Promise<SyncOutcome> | SyncOutcome =>
        lock ? upload(owner, id) : { status: "busy" },
    )
  } catch {
    return { status: "busy" }
  }
}

let syncing: Promise<void> | undefined

function syncAll(owner: string, onSynced?: (id: string) => void) {
  syncing ??= listPendingDeviceDrawings(owner)
    .then(async (ids) => {
      for (const id of ids) {
        const outcome = await syncDeviceDrawingNow(owner, id)
        if (outcome.status === "synced" || outcome.status === "copied")
          onSynced?.(id)
        if (outcome.status === "copied") toastCopied(outcome)
      }
    })
    .catch(() => {})
    .finally(() => {
      syncing = undefined
    })
  return syncing
}

/**
 * Syncs on load, on reconnect, on focus, and every 10 seconds. `onSynced`
 * gets each drawing whose stored scene changed: replaced, or changed
 * elsewhere so the edits went up as a copy.
 */
export function useDeviceSync(
  owner: string | null,
  onSynced?: (id: string) => void,
) {
  const synced = useRef(onSynced)
  synced.current = onSynced
  useEffect(() => {
    if (!owner) return
    const run = () => {
      if (navigator.onLine) void syncAll(owner, (id) => synced.current?.(id))
    }
    run()
    const interval = setInterval(run, 10_000)
    window.addEventListener("online", run)
    window.addEventListener("focus", run)
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", run)
      window.removeEventListener("focus", run)
    }
  }, [owner])
}
