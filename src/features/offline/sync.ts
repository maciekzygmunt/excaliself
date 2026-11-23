// Uploads device drawings with unsaved edits. An editor holds its drawing
// while open, so a sync never uploads one underneath it: the online editor
// saves its own edits, and the offline page's open drawing waits until it
// closes.

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { MAX_DRAWING_IMAGE_BYTES } from "@/features/collab/room-files"
import { MAX_NAME_LENGTH } from "@/features/drawings/list-columns"
import type { PersistedFile } from "@/features/drawings/scene"
import { sceneRevision } from "@/features/drawings/scene-revision"
import { m } from "@/paraglide/messages"
import { syncDeviceDrawing } from "./server"
import {
  deviceDrawingRecord,
  forgetDeviceDrawing,
  listPendingDeviceDrawings,
  markDeviceDrawingSaved,
  moveToNewDeviceDrawing,
  purgeDeviceDrawings,
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

/** Drops a clean copy once no editor has it open. */
export const forgetDeviceDrawingWhenFree = (owner: string, id: string) =>
  navigator.locks.request(lockName(owner, id), () =>
    forgetDeviceDrawing(owner, id),
  )

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
  toast(m.offline_copied_title({ name: copied.name }), {
    id: `offline-copy:${copied.copyName}`,
    description: m.offline_copied_description({ copyName: copied.copyName }),
  })
}

// More than the server keeps per drawing, well under the request body cap.
// The rest come back as refused and get reported.
const UPLOAD_BUDGET = 2 * MAX_DRAWING_IMAGE_BYTES

function withinUploadBudget(files: readonly PersistedFile[]) {
  let total = 0
  return files.flatMap(({ fileId, dataUrl }) => {
    total += dataUrl.length
    return total <= UPLOAD_BUDGET ? [{ fileId, dataUrl }] : []
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
        files: withinUploadBudget(drawing.files),
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
      toast.error(m.offline_images_refused_title({ name }), {
        id: `offline-images:${id}`,
        description: m.offline_images_refused_description(),
      })
    return { status: "synced" }
  }
  // Changed elsewhere, shared, moved to Team, or trashed: keep both versions.
  const suffix = ` (${m.offline_copy_label()})`
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
    if ((await deviceDrawingRecord(owner, id))?.status !== "pending")
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

/**
 * For turning offline drawings off: uploads pending edits, then drops every
 * copy. "pending" or "open", with the copies kept, if edits remain or an
 * editor has a drawing open, where an edit may not be written yet.
 */
export async function drainDeviceDrawings(owner: string) {
  for (const id of await listPendingDeviceDrawings(owner)) {
    const outcome = await syncDeviceDrawingNow(owner, id)
    if (outcome.status === "copied") toastCopied(outcome)
  }
  if ((await listPendingDeviceDrawings(owner)).length > 0) return "pending"
  const { held = [] } = await navigator.locks.query()
  const editors = lockName(owner, "")
  if (
    held.some(
      (lock) => lock.mode === "shared" && lock.name?.startsWith(editors),
    )
  )
    return "open"
  await purgeDeviceDrawings(owner)
  return "done"
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
