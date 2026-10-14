/**
 * Room images over HTTP: POST `pending` images (then flip to `saved`/`error`,
 * which syncs as a delta) and GET `saved` ones this tab has no bytes for.
 */

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  type ImageStatus,
  selectMissingFileIds,
  selectUploads,
} from "./file-sync"
import { fetchRoomFile, uploadRoomFile } from "./file-transport"
import type { SceneElement } from "./protocol"
import { MAX_DRAWING_IMAGE_BYTES } from "./room-files"
import type { RoomPath } from "./room-url"

const MAX_FETCH_ATTEMPTS = 3

// Scheduled, not left to the next frame: an idle room sends none.
const FETCH_RETRY_MS = 2_000

// Counts only unanswered attempts; a refusal is final at once.
const MAX_UPLOAD_ATTEMPTS = 3

/**
 * Solo saves and room uploads both refuse images past the drawing's cap. A
 * Room keeps removed images for undo (see `saveRoomScene`), so they still count.
 */
export function toastImageCapFull() {
  toast.error("This drawing can't hold more images", {
    // One toast for a batch of refusals.
    id: "image-cap-full",
    description: `A drawing saves up to ${MAX_DRAWING_IMAGE_BYTES / 1024 / 1024} MB of images. Remove some to add more. While shared, removed images can take up to a day to free their space.`,
  })
}

/** Version bump syncs the flip to peers; NEVER keeps it out of local undo. */
export function markImageStatus(
  api: ExcalidrawImperativeAPI,
  fileId: string,
  status: Exclude<ImageStatus, "pending">,
) {
  const elements = api.getSceneElementsIncludingDeleted()
  let changed = false
  const next: OrderedExcalidrawElement[] = elements.map((element) => {
    if (element.type !== "image" || element.fileId !== fileId) return element
    if (element.status === status) return element
    changed = true
    return newElementWith(element, { status })
  })
  if (!changed) return
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER })
}

export function useRoomFiles(options: {
  /** The Room's address; null keeps both directions closed. */
  room: RoomPath | null
  excalidrawAPI: ExcalidrawImperativeAPI | null
  /** Already stored; `restore()` marks them `pending`, so skip re-uploading. */
  storedFileIds: readonly string[]
}) {
  const { room, excalidrawAPI, storedFileIds } = options

  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const roomRef = useRef(room)
  roomRef.current = room

  /** Stored, in flight, or given up on. Claimed before the request goes out. */
  const skipUploadRef = useRef<Set<string>>(new Set(storedFileIds))
  const uploadAttemptsRef = useRef<Map<string, number>>(new Map())
  const inFlightFetchRef = useRef<Set<string>>(new Set())
  const fetchAttemptsRef = useRef<Map<string, number>>(new Map())
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const seededForRef = useRef(room)

  const cancelRetries = useCallback(() => {
    for (const timer of retryTimersRef.current) clearTimeout(timer)
    retryTimersRef.current.clear()
  }, [])

  useEffect(() => {
    // A new room is a new drawing; drop all per-room state.
    if (seededForRef.current !== room) {
      seededForRef.current = room
      skipUploadRef.current = new Set()
      uploadAttemptsRef.current = new Map()
      inFlightFetchRef.current = new Set()
      fetchAttemptsRef.current = new Map()
      cancelRetries()
    }
    for (const fileId of storedFileIds) skipUploadRef.current.add(fileId)
  }, [room, storedFileIds, cancelRetries])

  useEffect(() => cancelRetries, [cancelRetries])

  const uploadPending = useCallback(
    (elements: readonly SceneElement[], files: BinaryFiles) => {
      const room = roomRef.current
      if (!room) return

      for (const file of selectUploads(
        elements,
        files,
        skipUploadRef.current,
      )) {
        skipUploadRef.current.add(file.fileId)
        const attempt = (uploadAttemptsRef.current.get(file.fileId) ?? 0) + 1
        uploadAttemptsRef.current.set(file.fileId, attempt)

        void uploadRoomFile(room, file).then((outcome) => {
          // A network blip leaves it `pending` for the next onChange to retry.
          if (outcome === "failed" && attempt < MAX_UPLOAD_ATTEMPTS) {
            skipUploadRef.current.delete(file.fileId)
            return
          }
          const api = apiRef.current
          if (!api) return
          if (outcome === "full") toastImageCapFull()
          markImageStatus(
            api,
            file.fileId,
            outcome === "stored" ? "saved" : "error",
          )
        })
      }
    },
    [],
  )

  // A ref so the retry can call itself and see the latest room.
  const requestFileRef = useRef<(room: RoomPath, fileId: string) => void>(
    () => {},
  )
  requestFileRef.current = (room, fileId) => {
    if (inFlightFetchRef.current.has(fileId)) return
    const attempts = fetchAttemptsRef.current.get(fileId) ?? 0
    if (attempts >= MAX_FETCH_ATTEMPTS) return

    fetchAttemptsRef.current.set(fileId, attempts + 1)
    inFlightFetchRef.current.add(fileId)
    void fetchRoomFile(room, fileId).then((file) => {
      inFlightFetchRef.current.delete(fileId)
      if (file) return apiRef.current?.addFiles([file])

      const timer = setTimeout(() => {
        retryTimersRef.current.delete(timer)
        if (roomRef.current === room) requestFileRef.current(room, fileId)
      }, FETCH_RETRY_MS)
      retryTimersRef.current.add(timer)
    })
  }

  const fetchMissing = useCallback((elements: readonly SceneElement[]) => {
    const room = roomRef.current
    const api = apiRef.current
    if (!room || !api) return

    const known = new Set(Object.keys(api.getFiles()))
    for (const fileId of selectMissingFileIds(elements, known)) {
      requestFileRef.current(room, fileId)
    }
  }, [])

  return { uploadPending, fetchMissing }
}
