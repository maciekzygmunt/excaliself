import { useMutation } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceCallback } from "./use-debounce-callback"

const DEBOUNCE_MS = 300
const SAVED_INDICATOR_MS = 2000

type Options<T> = {
  onSave: (data: T) => Promise<void>
  /** Fingerprint used to skip redundant saves. */
  getSignature: (data: T) => string
  /** When true, the very first change is treated as initial state and skipped. */
  skipInitialChange?: boolean
  onError?: (error: unknown) => void
}

export function useAutoSave<T>({
  onSave,
  getSignature,
  skipInitialChange = false,
  onError,
}: Options<T>) {
  // Hold all consumer callbacks in a single ref so the debounced closure stays
  // stable across renders without going stale on consumer re-renders.
  const handlersRef = useRef({ onSave, getSignature, onError })
  handlersRef.current = { onSave, getSignature, onError }

  const { mutate, isPending } = useMutation({
    mutationFn: (data: T) => handlersRef.current.onSave(data),
    onError: (err) => handlersRef.current.onError?.(err),
  })

  const [saved, setSaved] = useState(false)
  const initializedRef = useRef(false)
  const unmountedRef = useRef(false)
  const lastSavedSigRef = useRef<string | null>(null)

  const performSave = useCallback(
    (data: T) => {
      const sig = handlersRef.current.getSignature(data)
      if (sig === lastSavedSigRef.current) return
      // After unmount, mutate() drops its observer callbacks — save directly.
      if (unmountedRef.current) {
        void handlersRef.current
          .onSave(data)
          .catch((err) => handlersRef.current.onError?.(err))
        return
      }
      mutate(data, {
        onSuccess: () => {
          lastSavedSigRef.current = sig
          setSaved(true)
        },
      })
    },
    [mutate],
  )

  const { run: runDebouncedSave, flush: flushDebouncedSave } =
    useDebounceCallback(performSave, DEBOUNCE_MS)

  const handleChange = useCallback(
    (data: T) => {
      if (!initializedRef.current) {
        initializedRef.current = true
        if (skipInitialChange) {
          lastSavedSigRef.current = handlersRef.current.getSignature(data)
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
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      flushDebouncedSave()
    }
  }, [flushDebouncedSave])

  return {
    saving: isPending,
    saved,
    handleChange,
  }
}
