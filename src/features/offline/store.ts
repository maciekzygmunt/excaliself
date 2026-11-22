// Private drawings kept in this browser's IndexedDB, so they open offline and
// edits survive until the server stores them. Images live in their own store,
// so a draft write only touches the bytes that changed.

import type { PersistedFile, ScenePayload } from "@/features/drawings/scene"

export type DeviceDrawing = {
  owner: string
  id: string
  name: string
  data: string
  /** The server version this copy builds on. Null: made on this device. */
  baseRevision: string | null
  /** "pending": holds edits the server has not stored. */
  status: "clean" | "pending"
  /** The editor session that wrote the latest draft. */
  writer?: string
}

type StoredFile = PersistedFile & { owner: string; drawingId: string }

const DRAWINGS = "drawings"
const FILES = "files"
const accountKey = "excaliself:offline-account"
const enabledKey = "excaliself:offline-enabled"

/** HTTPS or localhost, with IndexedDB. */
export function canKeepDeviceDrawings() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "indexedDB" in window
  )
}

// Read once per page load: the Settings switch reloads the page.
let enabled: boolean | undefined

/** Offline drawings are opt-in per browser, in Settings. */
export function supportsDeviceDrawings() {
  if (!canKeepDeviceDrawings()) return false
  if (enabled === undefined) {
    try {
      enabled = localStorage.getItem(enabledKey) === "1"
    } catch {
      enabled = false
    }
  }
  return enabled
}

/** Takes effect on the next page load. */
export function setDeviceDrawingsEnabled(on: boolean) {
  if (on) localStorage.setItem(enabledKey, "1")
  else localStorage.removeItem(enabledKey)
}

/** The signed-in account, kept for the offline page, which can't ask the server. */
export function deviceAccount() {
  try {
    return localStorage.getItem(accountKey)
  } catch {
    return null
  }
}

export function setDeviceAccount(owner: string | null) {
  try {
    if (owner) localStorage.setItem(accountKey, owner)
    else localStorage.removeItem(accountKey)
  } catch {
    // Storage can be off. The online editor still works.
  }
}

const changes = new EventTarget()
let channel: BroadcastChannel | undefined

// Opened by writers too, so other tabs hear their writes.
function openChannel() {
  if (!channel) {
    channel = new BroadcastChannel("excaliself:offline-drawings")
    channel.onmessage = () => changes.dispatchEvent(new Event("change"))
  }
  return channel
}

/** Calls `listener` after any tab changes the device drawings. */
export function subscribeToDeviceDrawings(listener: () => void) {
  openChannel()
  changes.addEventListener("change", listener)
  return () => changes.removeEventListener("change", listener)
}

let database: Promise<IDBDatabase> | undefined

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("excaliself:offline", 1)
    request.onupgradeneeded = () => {
      const db = request.result
      const drawings = db.createObjectStore(DRAWINGS, {
        keyPath: ["owner", "id"],
      })
      drawings.createIndex("names", ["owner", "name", "id"])
      drawings.createIndex("status", ["owner", "status"])
      db.createObjectStore(FILES, { keyPath: ["owner", "drawingId", "fileId"] })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close()
        database = undefined
      }
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/** Runs `body` in one transaction; resolves once it commits. */
async function transact<T>(
  mode: IDBTransactionMode,
  body: (stores: {
    drawings: IDBObjectStore
    files: IDBObjectStore
  }) => Promise<T>,
): Promise<T> {
  const tx = (await openDatabase()).transaction([DRAWINGS, FILES], mode)
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error("Device write aborted"))
  })
  let result: T
  try {
    result = await body({
      drawings: tx.objectStore(DRAWINGS),
      files: tx.objectStore(FILES),
    })
  } catch (error) {
    committed.catch(() => {})
    try {
      tx.abort()
    } catch {
      // Already aborted by the failed request.
    }
    throw error
  }
  await committed
  if (mode === "readwrite") {
    changes.dispatchEvent(new Event("change"))
    openChannel().postMessage("change")
  }
  return result
}

const filesOf = (owner: string, id: string) =>
  IDBKeyRange.bound([owner, id], [owner, id, []])

async function storedFileIds(files: IDBObjectStore, owner: string, id: string) {
  const keys = await done(files.getAllKeys(filesOf(owner, id)))
  return new Set(keys.map((key) => (key as [string, string, string])[2]))
}

const sameIds = (a: ReadonlySet<string>, b: readonly string[]) =>
  a.size === b.length && b.every((fileId) => a.has(fileId))

function putFiles(
  files: IDBObjectStore,
  owner: string,
  drawingId: string,
  list: readonly PersistedFile[],
) {
  for (const { fileId, mimeType, dataUrl } of list)
    files.put({ owner, drawingId, fileId, mimeType, dataUrl } as StoredFile)
}

export const readDeviceDrawing = (owner: string, id: string) =>
  transact("readonly", async ({ drawings, files }) => {
    const drawing: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (!drawing) return undefined
    const stored: StoredFile[] = await done(files.getAll(filesOf(owner, id)))
    return {
      ...drawing,
      files: stored.map(({ fileId, mimeType, dataUrl }) => ({
        fileId,
        mimeType,
        dataUrl,
      })),
    }
  })

/** The record without its images. */
export const deviceDrawingRecord = (owner: string, id: string) =>
  transact(
    "readonly",
    ({ drawings }): Promise<DeviceDrawing | undefined> =>
      done(drawings.get([owner, id])),
  )

/** Names only: a key cursor on the names index never loads scenes or images. */
export const listDeviceDrawings = (owner: string) =>
  transact(
    "readonly",
    ({ drawings }) =>
      new Promise<{ id: string; name: string }[]>((resolve, reject) => {
        const list: { id: string; name: string }[] = []
        const cursor = drawings
          .index("names")
          .openKeyCursor(IDBKeyRange.bound([owner], [owner, []]))
        cursor.onsuccess = () => {
          if (!cursor.result) return resolve(list)
          const [, name, id] = cursor.result.key as [string, string, string]
          list.push({ id, name })
          cursor.result.continue()
        }
        cursor.onerror = () => reject(cursor.error)
      }),
  )

export const listPendingDeviceDrawings = (owner: string) =>
  transact("readonly", async ({ drawings }) => {
    // An index's getAllKeys gives primary keys: [owner, id].
    const keys = await done(
      drawings.index("status").getAllKeys([owner, "pending"]),
    )
    return keys.map((key) => (key as [string, string])[1])
  })

/**
 * Keeps the server's version of a drawing an editor opened. A copy with
 * edits the server lacks stays as it is.
 */
export function keepDeviceDrawing(
  owner: string,
  drawing: { id: string; name: string; data: string; files: PersistedFile[] },
  baseRevision: string,
) {
  const { id, name, data } = drawing
  return transact("readwrite", async ({ drawings, files }) => {
    const current: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (current?.status === "pending") return
    // Same version: rewrite only to repair missing images.
    if (
      current?.baseRevision === baseRevision &&
      current.name === name &&
      sameIds(
        await storedFileIds(files, owner, id),
        drawing.files.map((file) => file.fileId),
      )
    )
      return
    drawings.put({
      owner,
      id,
      name,
      data,
      baseRevision,
      status: "clean",
    } satisfies DeviceDrawing)
    files.delete(filesOf(owner, id))
    putFiles(files, owner, id, drawing.files)
  })
}

/**
 * Stores an edit. False when the drawing isn't kept on this device. A writer
 * taking over from another brings `base`, the version its edits build on;
 * its own later drafts keep the base its saves advanced.
 */
export function writeDeviceDraft(
  owner: string,
  id: string,
  scene: ScenePayload,
  writer: string,
  base: string | null,
) {
  return transact("readwrite", async ({ drawings, files }) => {
    const current: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (!current) return false
    const storedIds = await storedFileIds(files, owner, id)
    const used = new Set(scene.files.map((file) => file.fileId))
    const added = scene.files.filter((file) => !storedIds.has(file.fileId))
    if (current.data !== scene.data || added.length > 0)
      drawings.put({
        ...current,
        data: scene.data,
        status: "pending",
        writer,
        baseRevision: current.writer === writer ? current.baseRevision : base,
      })
    putFiles(files, owner, id, added)
    for (const fileId of storedIds)
      if (!used.has(fileId)) files.delete([owner, id, fileId])
    return true
  })
}

/**
 * The server stored `saved` at `revision`, written by `writer`. Clean if the
 * copy holds just that. A later draft of the same writer builds on it; one
 * of another editor keeps its base, so its upload can't overwrite this save.
 */
export function markDeviceDrawingSaved(
  owner: string,
  id: string,
  saved: { data: string; fileIds: readonly string[] },
  revision: string,
  writer: string | undefined,
) {
  return transact("readwrite", async ({ drawings, files }) => {
    const current: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (!current) return
    const same =
      current.data === saved.data &&
      sameIds(await storedFileIds(files, owner, id), saved.fileIds)
    if (!same && current.writer !== writer) return
    drawings.put({
      ...current,
      baseRevision: revision,
      status: same ? "clean" : "pending",
    })
  })
}

export function createDeviceDrawing(owner: string, name: string) {
  const drawing: DeviceDrawing = {
    owner,
    id: crypto.randomUUID(),
    name,
    data: JSON.stringify({ elements: [], appState: {} }),
    baseRevision: null,
    status: "pending",
  }
  return transact("readwrite", async ({ drawings }) => {
    drawings.put(drawing)
    return drawing
  })
}

/**
 * Turns a copy whose server version moved on into a new drawing, so the
 * next sync uploads it beside the original instead of over it.
 */
export function moveToNewDeviceDrawing(
  owner: string,
  id: string,
  name: string,
) {
  return transact("readwrite", async ({ drawings, files }) => {
    const current: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (!current) return undefined
    const stored: StoredFile[] = await done(files.getAll(filesOf(owner, id)))
    const copy: DeviceDrawing = {
      ...current,
      id: crypto.randomUUID(),
      name,
      baseRevision: null,
      status: "pending",
    }
    drawings.delete([owner, id])
    files.delete(filesOf(owner, id))
    drawings.put(copy)
    putFiles(files, owner, copy.id, stored)
    return copy
  })
}

/** Drops a copy that holds no unsaved edits. */
export function forgetDeviceDrawing(owner: string, id: string) {
  return transact("readwrite", async ({ drawings, files }) => {
    const current: DeviceDrawing | undefined = await done(
      drawings.get([owner, id]),
    )
    if (current?.status !== "clean") return
    drawings.delete([owner, id])
    files.delete(filesOf(owner, id))
  })
}

/** Drops every copy an account kept. For an account that was deleted. */
export function purgeDeviceDrawings(owner: string) {
  const all = IDBKeyRange.bound([owner], [owner, []])
  return transact("readwrite", async ({ drawings, files }) => {
    drawings.delete(all)
    files.delete(all)
  })
}
