import { useCallback, useEffect, useRef, useState } from "react"
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const getSignatureRef = useRef(getSignature)
  getSignatureRef.current = getSignature

  const stateRef = useRef({
    pendingData: null as T | null,
    initialized: false,
    lastPersistedSignature: null as string | null,
    lastQueuedSignature: null as string | null,
  })

  const performSave = useCallback(async (data: T) => {
    const state = stateRef.current
    const signature = getSignatureRef.current?.(data) ?? null

    if (signature && signature === state.lastPersistedSignature) {
      state.pendingData = null
      state.lastQueuedSignature = signature
      return
    }

    state.pendingData = null
    setSaving(true)
    try {
      await onSaveRef.current(data)
      if (signature) {
        state.lastPersistedSignature = signature
        state.lastQueuedSignature = signature
      }
      setSaved(true)
    } catch (err) {
      if (signature) {
        state.lastQueuedSignature = state.lastPersistedSignature
      }
      console.error("Failed to save:", err)
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
            state.lastPersistedSignature = signature
            state.lastQueuedSignature = signature
          }
          return
        }
      }

      if (
        signature &&
        (signature === state.lastPersistedSignature ||
          signature === state.lastQueuedSignature)
      ) {
        return
      }

      if (signature) {
        state.lastQueuedSignature = signature
      }

      state.pendingData = data
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
      pendingData: null,
      initialized: false,
      lastPersistedSignature: null,
      lastQueuedSignature: null,
    }
    setSaving(false)
    setSaved(false)
  }, [cancelDebouncedSave, resetKey])

  useEffect(() => {
    return () => {
      const pendingData = stateRef.current.pendingData
      cancelDebouncedSave()
      if (pendingData) {
        void onSaveRef.current(pendingData)
      }
    }
  }, [cancelDebouncedSave])

  return { saving, saved, handleChange }
}
