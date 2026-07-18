import { useMutation } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceCallback } from "./use-debounce-callback"

const DEBOUNCE_MS = 300
const SAVED_INDICATOR_MS = 2000

type Options<TData, TPayload> = {
  /** Build the exact payload that gets persisted. Runs once per save attempt. */
  toPayload: (data: TData) => TPayload
  /** Fingerprint of a payload, used to skip redundant saves. */
  getSignature: (payload: TPayload) => string
  onSave: (payload: TPayload) => Promise<unknown>
  /**
   * Saves sharing this scope id run one at a time (react-query mutation
   * scope), so a slow older save can never land after a newer one.
   */
  scopeId?: string
  /** When true, the very first change is treated as initial state and skipped. */
  skipInitialChange?: boolean
  onError?: (error: unknown) => void
}

export function useAutoSave<TData, TPayload>({
  toPayload,
  getSignature,
  onSave,
  scopeId,
  skipInitialChange = false,
  onError,
}: Options<TData, TPayload>) {
  // Hold all consumer callbacks in a single ref so the debounced closure stays
  // stable across renders without going stale on consumer re-renders.
  const handlersRef = useRef({ toPayload, getSignature, onSave, onError })
  handlersRef.current = { toPayload, getSignature, onSave, onError }

  // Mutation-level callbacks (unlike the per-mutate ones below) run even after
  // unmount, so the unmount flush still reports errors.
  const { mutate, isPending } = useMutation({
    mutationFn: (payload: TPayload) => handlersRef.current.onSave(payload),
    scope: scopeId ? { id: scopeId } : undefined,
    onError: (err) => handlersRef.current.onError?.(err),
  })

  const [saved, setSaved] = useState(false)
  const initializedRef = useRef(false)
  const lastSavedSigRef = useRef<string | null>(null)
  const pendingSigRef = useRef<string | null>(null)
  const latestDataRef = useRef<TData | null>(null)

  const performSaveRef = useRef<(data: TData) => void>(() => {})
  const performSave = useCallback(
    (data: TData) => {
      const payload = handlersRef.current.toPayload(data)
      const sig = handlersRef.current.getSignature(payload)
      if (sig === lastSavedSigRef.current || sig === pendingSigRef.current) {
        return
      }
      pendingSigRef.current = sig
      // Per-mutate callbacks are dropped if the component unmounted mid-save;
      // that only skips indicator/re-check bookkeeping, which is moot then.
      mutate(payload, {
        onSuccess: () => {
          lastSavedSigRef.current = sig
          setSaved(true)
          // The user may have kept editing — or undone back to the previously
          // saved state — while this save was in flight. If the latest state
          // no longer matches what was committed, save it now.
          const latest = latestDataRef.current
          if (latest != null) performSaveRef.current(latest)
        },
        onSettled: () => {
          if (pendingSigRef.current === sig) pendingSigRef.current = null
        },
      })
    },
    [mutate],
  )
  performSaveRef.current = performSave

  const { run: runDebouncedSave, flush: flushDebouncedSave } =
    useDebounceCallback(performSave, DEBOUNCE_MS)

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
      runDebouncedSave(data)
    },
    [runDebouncedSave, skipInitialChange],
  )

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
  }
}
