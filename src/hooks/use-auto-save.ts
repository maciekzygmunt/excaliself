import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useDebounceCallback } from "./use-debounce-callback"

interface UseAutoSaveOptions<T> {
  onSave: (data: T) => Promise<void>
  debounceMs?: number
  savedIndicatorMs?: number
  getSignature?: (data: T) => string
  resetKey?: string
  skipInitialChange?: boolean
}

interface UseAutoSaveReturn<T> {
  saving: boolean
  saved: boolean
  handleChange: (data: T) => void
}

export function useAutoSave<T>({
  onSave,
  debounceMs = 300,
  savedIndicatorMs = 2000,
  getSignature,
  resetKey,
  skipInitialChange = false,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  // State machine lifecycle:
  //
  // 1. handleChange is called with new data
  // 2. If not yet initialized and skipInitialChange is true, record signatures and skip
  // 3. If the signature matches savedSignature or pendingSignature, skip (no-op)
  // 4. Otherwise, store the pendingSignature and queue unsavedData for debounced save
  // 5. After debounce, performSave fires:
  //    - If signature matches savedSignature, clear unsavedData and skip
  //    - Otherwise, call onSave and update savedSignature on success
  //    - On failure, roll pendingSignature back to savedSignature
  // 6. On unmount, any remaining unsavedData is flushed immediately

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const getSignatureRef = useRef(getSignature)
  getSignatureRef.current = getSignature

  const stateRef = useRef({
    unsavedData: null as T | null,
    initialized: false,
    savedSignature: null as string | null,
    pendingSignature: null as string | null,
  })

  const performSave = useCallback(async (data: T) => {
    const state = stateRef.current
    const signature = getSignatureRef.current?.(data) ?? null

    if (signature && signature === state.savedSignature) {
      state.unsavedData = null
      state.pendingSignature = signature
      return
    }

    state.unsavedData = null
    setSaving(true)
    try {
      await onSaveRef.current(data)
      if (signature) {
        state.savedSignature = signature
        state.pendingSignature = signature
      }
      setSaved(true)
    } catch {
      if (signature) {
        state.pendingSignature = state.savedSignature
      }
      toast.error("Failed to save drawing")
    } finally {
      setSaving(false)
    }
  }, [])

  const { run: runDebouncedSave, cancel: cancelDebouncedSave } =
    useDebounceCallback(performSave, debounceMs)

  const handleChange = useCallback(
    (data: T) => {
      const state = stateRef.current
      const signature = getSignatureRef.current?.(data) ?? null

      if (!state.initialized) {
        state.initialized = true
        if (skipInitialChange) {
          if (signature) {
            state.savedSignature = signature
            state.pendingSignature = signature
          }
          return
        }
      }

      if (
        signature &&
        (signature === state.savedSignature ||
          signature === state.pendingSignature)
      ) {
        return
      }

      if (signature) {
        state.pendingSignature = signature
      }

      state.unsavedData = data
      runDebouncedSave(data)
    },
    [runDebouncedSave, skipInitialChange],
  )

  useEffect(() => {
    if (!saved) return
    const timeoutId = setTimeout(() => {
      setSaved(false)
    }, savedIndicatorMs)
    return () => clearTimeout(timeoutId)
  }, [saved, savedIndicatorMs])

  useEffect(() => {
    if (resetKey === undefined) return

    cancelDebouncedSave()
    stateRef.current = {
      unsavedData: null,
      initialized: false,
      savedSignature: null,
      pendingSignature: null,
    }
    setSaving(false)
    setSaved(false)
  }, [cancelDebouncedSave, resetKey])

  useEffect(() => {
    return () => {
      const unsavedData = stateRef.current.unsavedData
      cancelDebouncedSave()
      if (unsavedData) {
        void onSaveRef.current(unsavedData)
      }
    }
  }, [cancelDebouncedSave])

  return { saving, saved, handleChange }
}
