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

interface AutoSaveRuntime<T> {
  pendingData: T | null
  initialized: boolean
  lastPersistedSignature: string | null
  lastQueuedSignature: string | null
  onSave: (data: T) => Promise<void>
  getSignature?: (data: T) => string
}

const createInitialRuntime = <T>(
  onSave: (data: T) => Promise<void>,
  getSignature?: (data: T) => string,
): AutoSaveRuntime<T> => ({
  pendingData: null,
  initialized: false,
  lastPersistedSignature: null,
  lastQueuedSignature: null,
  onSave,
  getSignature,
})

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
  const runtimeRef = useRef<AutoSaveRuntime<T>>(
    createInitialRuntime(onSave, getSignature),
  )

  runtimeRef.current.onSave = onSave
  runtimeRef.current.getSignature = getSignature

  const performSave = useCallback(async (data: T) => {
    const runtime = runtimeRef.current
    const signature = runtime.getSignature?.(data) ?? null

    if (signature && signature === runtime.lastPersistedSignature) {
      runtime.pendingData = null
      runtime.lastQueuedSignature = signature
      return
    }

    runtime.pendingData = null
    setSaving(true)
    try {
      await runtime.onSave(data)
      if (signature) {
        runtime.lastPersistedSignature = signature
        runtime.lastQueuedSignature = signature
      }
      setSaved(true)
    } catch (err) {
      if (signature) {
        runtime.lastQueuedSignature = runtime.lastPersistedSignature
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
      const runtime = runtimeRef.current
      const signature = runtime.getSignature?.(data) ?? null

      if (signature) {
        if (skipInitialChange && !runtime.initialized) {
          runtime.initialized = true
          runtime.lastPersistedSignature = signature
          runtime.lastQueuedSignature = signature
          return
        }
        runtime.initialized = true

        if (
          signature === runtime.lastPersistedSignature ||
          signature === runtime.lastQueuedSignature
        ) {
          return
        }
        runtime.lastQueuedSignature = signature
      } else if (skipInitialChange && !runtime.initialized) {
        runtime.initialized = true
        return
      } else {
        runtime.initialized = true
      }

      runtime.pendingData = data
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
    runtimeRef.current.pendingData = null
    runtimeRef.current.initialized = false
    runtimeRef.current.lastPersistedSignature = null
    runtimeRef.current.lastQueuedSignature = null
    setSaving(false)
    setSaved(false)
  }, [cancelDebouncedSave, resetKey])

  useEffect(() => {
    return () => {
      const pendingData = runtimeRef.current.pendingData
      cancelDebouncedSave()
      if (pendingData) {
        void runtimeRef.current.onSave(pendingData)
      }
    }
  }, [cancelDebouncedSave])

  return { saving, saved, handleChange }
}
