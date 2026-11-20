import type { ScenePayload } from "@/features/drawings/scene"
import { referencedFileIds } from "@/features/drawings/scene-files"
import { parseSceneElements } from "@/features/drawings/search"
import type { LocalDrawing, SyncResult } from "./types"

const accountKey = "excaliself:offline-account"
const records = "drawings"
const eligibility = "offlineEligibility"
type EligibilityMarker = { owner: string; id: string; version: string }
let database: Promise<IDBDatabase> | undefined
let channel: BroadcastChannel | undefined
const changes = new EventTarget()

export function supportsOfflineDrawings() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!window.indexedDB
  )
}

export function offlineAccount() {
  try {
    return localStorage.getItem(accountKey)
  } catch {
    return null
  }
}

export function setOfflineAccount(owner: string | null) {
  try {
    if (owner) localStorage.setItem(accountKey, owner)
    else localStorage.removeItem(accountKey)
  } catch {
    // Storage can be disabled. The online editor still works.
  }
}

export function subscribeToLocalDrawings(listener: () => void) {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("excaliself:offline-drawings")
    channel.onmessage = () => changes.dispatchEvent(new Event("change"))
  }
  changes.addEventListener("change", listener)
  return () => changes.removeEventListener("change", listener)
}

function notify() {
  changes.dispatchEvent(new Event("change"))
  channel?.postMessage("change")
}

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("excaliself:offline", 2)
    request.onupgradeneeded = ({ oldVersion }) => {
      const db = request.result
      if (oldVersion === 0) {
        const store = db.createObjectStore(records, {
          keyPath: ["owner", "id"],
        })
        store.createIndex("drawingNames", ["owner", "name", "id"])
        store.createIndex("queue", ["owner", "status"])
      }
      db.createObjectStore(eligibility, { keyPath: ["owner", "id"] })
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        database = undefined
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

async function read<T>(
  lookup: (store: IDBObjectStore) => IDBRequest<T>,
  storeName = records,
): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = lookup(db.transaction(storeName).objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const readLocalDrawing = (owner: string, id: string) =>
  read<LocalDrawing | undefined>((store) => store.get([owner, id]))

export async function listLocalDrawings(owner: string) {
  // Read the index keys so listing drawings never loads their image bytes.
  const db = await openDatabase()
  return new Promise<{ id: string; name: string }[]>((resolve, reject) => {
    const index = db
      .transaction(records)
      .objectStore(records)
      .index("drawingNames")
    const request = index.openKeyCursor(IDBKeyRange.bound([owner], [owner, []]))
    const drawings: { id: string; name: string }[] = []
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(drawings)
        return
      }
      const [, name, id] = cursor.key as [string, string, string]
      drawings.push({ id, name })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

export async function listPendingDrawings(owner: string) {
  const keys = await read((store) =>
    store.index("queue").getAllKeys([owner, "pending"]),
  )
  return keys.map((key) => (key as [string, string])[1])
}

type EligibilityUpdate = { expected: string | undefined } | { revoke: true }

async function update(
  owner: string,
  id: string,
  apply: (
    current: LocalDrawing | undefined,
    store: IDBObjectStore,
  ) => LocalDrawing | undefined,
  check?: EligibilityUpdate,
): Promise<LocalDrawing | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      check ? [records, eligibility] : records,
      "readwrite",
      { durability: "strict" },
    )
    const store = tx.objectStore(records)
    const lookup: IDBRequest<LocalDrawing | undefined> = store.get([owner, id])
    let result: LocalDrawing | undefined
    let changed = false
    const write = () => {
      try {
        result = apply(lookup.result, store)
        changed = result !== lookup.result
        if (changed) {
          if (result) store.put(result)
          else store.delete([owner, id])
        }
      } catch (error) {
        tx.abort()
        reject(error)
      }
    }
    if (check && "expected" in check) {
      const marker: IDBRequest<EligibilityMarker | undefined> = tx
        .objectStore(eligibility)
        .get([owner, id])
      marker.onsuccess = () => {
        if (marker.result?.version === check.expected) write()
        else result = lookup.result
      }
    } else {
      if (check)
        tx.objectStore(eligibility).put({
          owner,
          id,
          version: crypto.randomUUID(),
        })
      lookup.onsuccess = write
    }
    tx.oncomplete = () => {
      if (changed) notify()
      resolve(result)
    }
    tx.onabort = () =>
      reject(tx.error ?? new Error("Local drawing write was interrupted"))
  })
}

type ServerSnapshot = { id: string; name: string } & ScenePayload

export async function rememberDrawing(
  owner: string,
  snapshot: ServerSnapshot,
  signal: AbortSignal,
  verify: () => Promise<ServerSnapshot | undefined>,
) {
  const { id } = snapshot
  const marker = await read<EligibilityMarker | undefined>(
    (store) => store.get([owner, id]),
    eligibility,
  )
  // Once this browser learns a drawing was shared, moved, or trashed, an old
  // copy of the server query cannot make it eligible again.
  const confirmed = marker ? await verify() : snapshot
  if (!confirmed || signal.aborted) return undefined
  const { data, files, name } = confirmed
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  )
  const revision = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  const serverFileIds = new Set(files.map((file) => file.fileId))
  return update(
    owner,
    id,
    (current) => {
      if (signal.aborted || (current && current.status !== "clean"))
        return current
      if (
        current?.baseRevision === revision &&
        current.name === name &&
        current.serverFileIds.length === serverFileIds.size &&
        current.serverFileIds.every((fileId) => serverFileIds.has(fileId))
      )
        return current

      // If server image rows are missing, we may still have their bytes on this
      // device. Recover only images that are still part of the server scene.
      const referenced = referencedFileIds(parseSceneElements(data) ?? [])
      const recovered =
        current?.scene.files.filter(
          (file) =>
            referenced.has(file.fileId) && !serverFileIds.has(file.fileId),
        ) ?? []
      return {
        owner,
        id,
        name,
        baseRevision: revision,
        scene: { data, files: [...files, ...recovered] },
        serverFileIds: [...serverFileIds],
        editId:
          current?.baseRevision === revision
            ? current.editId
            : crypto.randomUUID(),
        status: "clean",
      }
    },
    { expected: marker?.version },
  )
}

export function removeOfflineEligibility(ids: readonly string[]) {
  if (!supportsOfflineDrawings()) return
  const owner = offlineAccount()
  if (!owner) return
  for (const id of ids) {
    void update(
      owner,
      id,
      (drawing) => {
        if (!drawing || drawing.status === "clean") return undefined
        if (drawing.status === "conflict") return drawing
        // Keep the latest draft, but disregard any acknowledgement for a write
        // made before the server confirmed the drawing is no longer editable.
        return { ...drawing, status: "conflict", sending: undefined }
      },
      { revoke: true },
    ).catch(() => {})
  }
}

export async function createLocalDrawing(owner: string, name: string) {
  const id = crypto.randomUUID()
  const drawing = await update(owner, id, () => ({
    owner,
    id,
    name,
    baseRevision: null,
    serverFileIds: [],
    editId: crypto.randomUUID(),
    status: "pending",
    scene: { data: '{"elements":[],"appState":{}}', files: [] },
  }))
  if (!drawing) throw new Error("Couldn't create a local drawing")
  return drawing
}

/**
 * A second tab editing the same local version gets its own private copy if
 * another tab saved first. It must never replace that tab's queued work.
 */
export async function saveLocalDrawing(
  previous: LocalDrawing,
  scene: ScenePayload,
) {
  const { owner, id } = previous
  const editId = crypto.randomUUID()
  const result = await update(owner, id, (current) => {
    if (!current || current.editId !== previous.editId) {
      return {
        owner,
        id: crypto.randomUUID(),
        name: `${previous.name.slice(0, 980)} (offline copy)`,
        baseRevision: null,
        serverFileIds: [],
        editId,
        status: "pending" as const,
        scene,
      }
    }
    return {
      ...current,
      editId,
      scene,
      status: current.status === "conflict" ? "conflict" : "pending",
      overCapFileIds: undefined,
    }
  })
  if (!result) throw new Error("Couldn't save the local drawing")
  return result
}

export function retryAsCopy(drawing: LocalDrawing) {
  return update(drawing.owner, drawing.id, (current, store) => {
    if (current?.status !== "conflict") return current
    store.delete([drawing.owner, drawing.id])
    return {
      ...current,
      id: crypto.randomUUID(),
      name: `${current.name.slice(0, 980)} (offline copy)`,
      baseRevision: null,
      serverFileIds: [],
      status: "pending",
      sending: undefined,
      editId: crypto.randomUUID(),
    }
  })
}

export function beginSync(owner: string, id: string) {
  return update(owner, id, (current) => {
    if (current?.status !== "pending" || current.sending) return current
    const { name, baseRevision, scene, editId, serverFileIds } = current
    return {
      ...current,
      sending: { id, name, baseRevision, scene, editId, serverFileIds },
    }
  })
}

export function finishSync(
  owner: string,
  id: string,
  editId: string,
  result: SyncResult,
) {
  return update(owner, id, (current) => {
    if (!current || current.sending?.editId !== editId) return current
    if (result.status === "saved") {
      return {
        ...current,
        baseRevision: result.revision,
        serverFileIds: current.sending.scene.files.map((file) => file.fileId),
        status: current.editId === editId ? "clean" : "pending",
        sending: undefined,
      }
    }
    return {
      ...current,
      status:
        current.editId !== editId && result.status !== "conflict"
          ? "pending"
          : result.status,
      sending: undefined,
      overCapFileIds:
        result.status === "images" && current.editId === editId
          ? result.overCapFileIds
          : undefined,
    }
  })
}
