import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceCallback } from "./use-debounce-callback"

type Options<T> = {
  onSave: (data: T) => Promise<void>
  /** Optional fingerprint used to skip redundant saves. */
  getSignature?: (data: T) => string
  /** When true, the very first change is treated as initial state and skipped. */
  skipInitialChange?: boolean
  onError?: (error: unknown) => void
  debounceMs?: number
  savedIndicatorMs?: number
}

type Result<T> = {
  saving: boolean
  saved: boolean
  handleChange: (data: T) => void
}

type SaveState = {
  initialized: boolean
  lastPersistedSignature: string | null
  lastQueuedSignature: string | null
}

export function useAutoSave<T>({
  onSave,
  getSignature,
  skipInitialChange = false,
  onError,
  debounceMs = 300,
  savedIndicatorMs = 2000,
}: Options<T>): Result<T> {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Hold the latest callbacks so the debounced save closure can stay stable
  // without going stale on consumer re-renders.
  const handlersRef = useRef({ onSave, getSignature, onError })
  handlersRef.current = { onSave, getSignature, onError }

  const stateRef = useRef<SaveState>({
    initialized: false,
    lastPersistedSignature: null,
    lastQueuedSignature: null,
  })

  const performSave = useCallback(async (data: T) => {
    const state = stateRef.current
    const handlers = handlersRef.current
    const signature = handlers.getSignature?.(data) ?? null

    if (signature && signature === state.lastPersistedSignature) {
      state.lastQueuedSignature = signature
      return
    }

    setSaving(true)
    try {
      await handlers.onSave(data)
      if (signature) {
        state.lastPersistedSignature = signature
        state.lastQueuedSignature = signature
      }
      setSaved(true)
    } catch (err) {
      if (signature) state.lastQueuedSignature = state.lastPersistedSignature
      handlers.onError?.(err)
    } finally {
      setSaving(false)
    }
  }, [])

  const { run: runDebouncedSave, flush: flushDebouncedSave } =
    useDebounceCallback(performSave, debounceMs)

  const handleChange = useCallback(
    (data: T) => {
      const state = stateRef.current
      const signature = handlersRef.current.getSignature?.(data) ?? null

      if (!state.initialized) {
        state.initialized = true
        if (skipInitialChange) {
          if (signature) {
            state.lastPersistedSignature = signature
            state.lastQueuedSignature = signature
          }
          return
        }
      }

      const isDuplicate =
        signature !== null &&
        (signature === state.lastPersistedSignature ||
          signature === state.lastQueuedSignature)
      if (isDuplicate) return

      if (signature) state.lastQueuedSignature = signature
      runDebouncedSave(data)
    },
    [runDebouncedSave, skipInitialChange],
  )

  // Auto-clear the "Saved" indicator after a moment.
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), savedIndicatorMs)
    return () => clearTimeout(id)
  }, [saved, savedIndicatorMs])

  // Flush any pending save on unmount so the user doesn't lose work.
  useEffect(() => () => flushDebouncedSave(), [flushDebouncedSave])

  return { saving, saved, handleChange }
}
