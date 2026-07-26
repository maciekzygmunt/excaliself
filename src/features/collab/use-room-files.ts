/**
 * The blob half of the room (canvas sharing spec §2.4): keep the drawing's
 * images and the drawing's elements in step, without ever putting bytes on
 * the socket.
 *
 * Two duties, both driven by the scene rather than by events:
 *
 * - **Uploading.** Anything this tab drew that is still `pending` gets POSTed;
 *   on success the element flips to `saved`, which bumps its version and so
 *   syncs to the room as a normal delta. A refusal — too large, too frequent —
 *   flips it to `error` instead, which is excalidraw's own errored-image
 *   placeholder and the signal peers use to never ask for it. A request that
 *   was never answered is neither: the image stays `pending` and is offered
 *   again, because a dropped connection is not a verdict on the picture.
 * - **Fetching.** Anything the room shows as `saved` that this tab has no
 *   bytes for is GET-ed and injected with `addFiles()`. That covers both a
 *   peer pasting mid-session and a late joiner whose page loaded first.
 *
 * Like the rest of the room plumbing, nothing here touches React state: both
 * entry points are called from `onChange` and from the socket's message
 * handler, either of which can fire many times a second.
 */

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types"
import { useCallback, useEffect, useRef } from "react"
import {
  type ImageStatus,
  selectMissingFileIds,
  selectUploads,
} from "./file-sync"
import { fetchRoomFile, uploadRoomFile } from "./file-transport"
import type { SceneElement } from "./protocol"

/**
 * A `saved` image whose bytes won't come is a placeholder that never resolves,
 * so a miss is worth retrying — but the row is written before the flip that
 * advertised it, which means a miss is already a surprise. Three attempts
 * covers a blip; more would be a tab hammering a 404 for the whole session.
 */
const MAX_FETCH_ATTEMPTS = 3

/**
 * How long a missed fetch waits before trying again. The retry is scheduled
 * rather than left to the next scene frame, because a room where everyone has
 * stopped drawing sends none — and a late joiner whose one GET blipped would
 * otherwise stare at an image with no bytes for the rest of the session.
 */
const FETCH_RETRY_MS = 2_000

/**
 * How many times a blob is offered before the tab stops carrying it. Only
 * unanswered attempts count — a refusal is final on the first one — and each
 * retry waits for the next `onChange`, so this is a bound on a burst rather
 * than a schedule.
 */
const MAX_UPLOAD_ATTEMPTS = 3

/**
 * Flips every element referencing `fileId` to the outcome of its upload.
 * `newElementWith` bumps the version, so the flip travels to peers as an
 * ordinary delta — and `CaptureUpdateAction.NEVER` keeps it out of the local
 * undo stack, because a storage outcome is not something the user did.
 */
function markImageStatus(
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
  /** The share token; null keeps both directions closed. */
  token: string | null
  excalidrawAPI: ExcalidrawImperativeAPI | null
  /**
   * The ids the page already loaded out of the database. They are the scene's
   * pre-existing images, and `restore()` hands them back as `pending` — so
   * without this list every visitor would re-upload the whole drawing.
   */
  storedFileIds: readonly string[]
}) {
  const { token, excalidrawAPI, storedFileIds } = options

  // Read through refs for the same reason the socket does: these callbacks
  // run inside onChange, and re-creating them would re-run its effects.
  const apiRef = useRef(excalidrawAPI)
  apiRef.current = excalidrawAPI
  const tokenRef = useRef(token)
  tokenRef.current = token

  /**
   * Ids `uploadPending` must not offer again: already in the database, stored
   * by this tab, in flight, or given up on. An id is claimed before its
   * request goes out, so the `onChange` that fires while it is in the air
   * can't send the same blob twice.
   */
  const skipUploadRef = useRef<Set<string>>(new Set(storedFileIds))
  const uploadAttemptsRef = useRef<Map<string, number>>(new Map())
  const inFlightFetchRef = useRef<Set<string>>(new Set())
  const fetchAttemptsRef = useRef<Map<string, number>>(new Map())
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  /** The token everything above was seeded for. */
  const seededForRef = useRef(token)

  const cancelRetries = useCallback(() => {
    for (const timer of retryTimersRef.current) clearTimeout(timer)
    retryTimersRef.current.clear()
  }, [])

  useEffect(() => {
    // A different token is a different drawing, so every judgement these hold
    // is about a room this tab has left.
    if (seededForRef.current !== token) {
      seededForRef.current = token
      skipUploadRef.current = new Set()
      uploadAttemptsRef.current = new Map()
      inFlightFetchRef.current = new Set()
      fetchAttemptsRef.current = new Map()
      cancelRetries()
    }
    for (const fileId of storedFileIds) skipUploadRef.current.add(fileId)
  }, [token, storedFileIds, cancelRetries])

  // A pending retry outlives the canvas it would inject into otherwise.
  useEffect(() => cancelRetries, [cancelRetries])

  /**
   * Called from `onChange`, and deliberately not gated on SCENE_INIT the way
   * element broadcasts are: the row has to exist before the element that
   * references it may claim to be `saved`, and an image pasted while the
   * socket is still opening must not be left pending forever.
   */
  const uploadPending = useCallback(
    (elements: readonly SceneElement[], files: BinaryFiles) => {
      const token = tokenRef.current
      if (!token) return

      for (const file of selectUploads(
        elements,
        files,
        skipUploadRef.current,
      )) {
        skipUploadRef.current.add(file.fileId)
        const attempt = (uploadAttemptsRef.current.get(file.fileId) ?? 0) + 1
        uploadAttemptsRef.current.set(file.fileId, attempt)

        void uploadRoomFile(token, file).then((outcome) => {
          // A blip is not a verdict. The image stays `pending` — which the
          // uploader still sees, since the bytes are local — and the next
          // `onChange` offers it again. Only a refusal, or a run of attempts
          // that got nowhere, earns the errored placeholder.
          if (outcome === "failed" && attempt < MAX_UPLOAD_ATTEMPTS) {
            skipUploadRef.current.delete(file.fileId)
            return
          }
          const api = apiRef.current
          if (!api) return
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

  /**
   * One attempt at one blob, carrying its own retry. Held in a ref rather
   * than a `useCallback` so it can schedule itself, and so the scheduled
   * attempt runs against the token this tab holds *then*, not now.
   */
  const requestFileRef = useRef<(token: string, fileId: string) => void>(
    () => {},
  )
  requestFileRef.current = (token, fileId) => {
    if (inFlightFetchRef.current.has(fileId)) return
    const attempts = fetchAttemptsRef.current.get(fileId) ?? 0
    if (attempts >= MAX_FETCH_ATTEMPTS) return

    fetchAttemptsRef.current.set(fileId, attempts + 1)
    inFlightFetchRef.current.add(fileId)
    void fetchRoomFile(token, fileId).then((file) => {
      inFlightFetchRef.current.delete(fileId)
      // A tab that uploaded this blob itself already has the bytes, so
      // addFiles is only ever additive here — and re-adding is harmless.
      if (file) return apiRef.current?.addFiles([file])

      const timer = setTimeout(() => {
        retryTimersRef.current.delete(timer)
        // A token change means a different room, whose scene will ask for
        // whatever it needs on its own.
        if (tokenRef.current === token) requestFileRef.current(token, fileId)
      }, FETCH_RETRY_MS)
      retryTimersRef.current.add(timer)
    })
  }

  /** Called with every scene the room hands this tab — SCENE_INIT included. */
  const fetchMissing = useCallback((elements: readonly SceneElement[]) => {
    const token = tokenRef.current
    const api = apiRef.current
    if (!token || !api) return

    const known = new Set(Object.keys(api.getFiles()))
    for (const fileId of selectMissingFileIds(elements, known)) {
      requestFileRef.current(token, fileId)
    }
  }, [])

  return { uploadPending, fetchMissing }
}
