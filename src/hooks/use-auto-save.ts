import { useMutation } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceCallback } from "./use-debounce-callback"

const DEBOUNCE_MS = 300
const SAVED_INDICATOR_MS = 2000

/** "skipped": the server stored nothing, so the payload stays unsaved. */
export type SaveOutcome = "saved" | "skipped"

type Options<TData, TPayload> = {
  /** Build the exact payload that gets persisted. Runs once per save attempt. */
  toPayload: (data: TData) => TPayload
  /** Fingerprint of a payload, used to skip redundant saves. */
  getSignature: (payload: TPayload) => string
  onSave: (payload: TPayload) => Promise<SaveOutcome>
  /**
   * Saves sharing this scope id run one at a time (react-query mutation
   * scope), so a slow older save can never land after a newer one.
   */
  scopeId?: string
  /** When true, the very first change is treated as initial state and skipped. */
  skipInitialChange?: boolean
  /**
   * While true, changes are recorded but not saved. When the pause lifts, the
   * latest recorded state is saved (the signature dedup skips it if nothing
   * actually changed).
   */
  paused?: boolean
  onError?: (error: unknown) => void
}

type SaveVars<TPayload> = { payload: TPayload; sig: string }

export function useAutoSave<TData, TPayload>({
  toPayload,
  getSignature,
  onSave,
  scopeId,
  skipInitialChange = false,
  paused = false,
  onError,
}: Options<TData, TPayload>) {
  // Hold all consumer callbacks in a single ref so the debounced closure stays
  // stable across renders without going stale on consumer re-renders.
  const handlersRef = useRef({ toPayload, getSignature, onSave, onError })
  handlersRef.current = { toPayload, getSignature, onSave, onError }
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const [saved, setSaved] = useState(false)
  const initializedRef = useRef(false)
  const lastSavedSigRef = useRef<string | null>(null)
  const pendingSigRef = useRef<string | null>(null)
  const latestDataRef = useRef<TData | null>(null)
  const performSaveRef = useRef<(data: TData) => void>(() => {})
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  // All bookkeeping lives in mutation-level callbacks: unlike per-mutate
  // callbacks, they run even after unmount, so the post-settle re-check and
  // error reporting survive the unmount flush.
  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: SaveVars<TPayload>) =>
      handlersRef.current.onSave(vars.payload),
    scope: scopeId ? { id: scopeId } : undefined,
    onSuccess: (result, { sig }) => {
      // A skip must not record its signature, or dedup would never retry it.
      if (result === "saved") {
        lastSavedSigRef.current = sig
        setSaved(true)
      }
      // The user may have kept editing — or undone back to the previously
      // saved state — while this save was in flight. If the latest state no
      // longer matches what was committed, save it now.
      const latest = latestDataRef.current
      if (latest != null && !pausedRef.current) performSaveRef.current(latest)
    },
    onError: (err) => handlersRef.current.onError?.(err),
    onSettled: (_data, _err, { sig }) => {
      if (pendingSigRef.current === sig) pendingSigRef.current = null
    },
  })

  const performSave = useCallback(
    (data: TData) => {
      const payload = handlersRef.current.toPayload(data)
      const sig = handlersRef.current.getSignature(payload)
      if (sig === lastSavedSigRef.current || sig === pendingSigRef.current) {
        return
      }
      pendingSigRef.current = sig
      // `flush` awaits the rejection; the catch only silences unawaited saves.
      const settled = mutateAsync({ payload, sig })
      settled.catch(() => {})
      inFlightRef.current = settled
    },
    [mutateAsync],
  )
  performSaveRef.current = performSave

  const { run: runDebouncedSave, flush: flushDebouncedSave } =
    useDebounceCallback(performSave, DEBOUNCE_MS)

  /** Saves all pending changes. Rejects on failure, so a share handoff stops. */
  const flush = useCallback(async () => {
    flushDebouncedSave()
    const latest = latestDataRef.current
    if (latest != null && initializedRef.current && !pausedRef.current) {
      performSave(latest)
    }
    // A save can chain another from onSuccess, so wait until none is new.
    let awaited: Promise<unknown> | null = null
    while (inFlightRef.current && inFlightRef.current !== awaited) {
      awaited = inFlightRef.current
      await awaited
    }
  }, [flushDebouncedSave, performSave])

  const handleChange = useCallback(
    (data: TData) => {
      latestDataRef.current = data
      if (!initializedRef.current) {
        initializedRef.current = true
        if (skipInitialChange) {
          lastSavedSigRef.current = handlersRef.current.getSignature(
            handlersRef.current.toPayload(data),
          )
          return
        }
      }
      if (pausedRef.current) return
      runDebouncedSave(data)
    },
    [runDebouncedSave, skipInitialChange],
  )

  // When a pause lifts, save the state recorded while paused; the signature
  // dedup turns this into a no-op if nothing actually changed.
  useEffect(() => {
    if (paused) return
    const latest = latestDataRef.current
    if (initializedRef.current && latest != null) runDebouncedSave(latest)
  }, [paused, runDebouncedSave])

  // Auto-clear the "Saved" indicator after a moment.
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), SAVED_INDICATOR_MS)
    return () => clearTimeout(id)
  }, [saved])

  // Flush any pending save on unmount so the user doesn't lose work.
  useEffect(() => {
    return () => flushDebouncedSave()
  }, [flushDebouncedSave])

  return {
    saving: isPending,
    saved,
    handleChange,
    flush,
  }
}
