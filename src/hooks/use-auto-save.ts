import { useCallback, useEffect, useRef, useState } from "react"

interface UseAutoSaveOptions<T> {
  onSave: (data: T) => Promise<void>
  debounceMs?: number
  savedIndicatorMs?: number
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
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDataRef = useRef<T | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const performSave = useCallback(
    async (data: T) => {
      pendingDataRef.current = null
      setSaving(true)
      try {
        await onSaveRef.current(data)
        setSaved(true)
        if (savedTimeoutRef.current) {
          clearTimeout(savedTimeoutRef.current)
        }
        savedTimeoutRef.current = setTimeout(
          () => setSaved(false),
          savedIndicatorMs,
        )
      } catch (err) {
        console.error("Failed to save:", err)
      } finally {
        setSaving(false)
      }
    },
    [savedIndicatorMs],
  )

  const handleChange = useCallback(
    (data: T) => {
      pendingDataRef.current = data
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        void performSave(data)
      }, debounceMs)
    },
    [performSave, debounceMs],
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
      // Flush pending unsaved changes
      if (pendingDataRef.current) {
        void onSaveRef.current(pendingDataRef.current)
      }
    }
  }, [])

  return { saving, saved, handleChange }
}
