import { useCallback, useEffect, useRef, useState } from "react"

interface UseAutoSaveOptions<T> {
  initialData: string
  debounceMs?: number
  savedIndicatorMs?: number
  onSave: (data: T) => Promise<void>
  serialize: (data: T) => string
}

interface UseAutoSaveReturn<T> {
  saving: boolean
  saved: boolean
  handleChange: (data: T) => void
}

export function useAutoSave<T>({
  initialData,
  debounceMs = 300,
  savedIndicatorMs = 2000,
  onSave,
  serialize,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedDataRef = useRef<string>(initialData)
  const latestDataRef = useRef<T | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Update lastSavedDataRef when initialData changes (e.g., route change)
  useEffect(() => {
    lastSavedDataRef.current = initialData
  }, [initialData])

  const performSave = useCallback(
    async (data: T, updateUi: boolean = true) => {
      const dataString = serialize(data)

      if (dataString === lastSavedDataRef.current) {
        return
      }

      if (updateUi) {
        setSaving(true)
      }

      try {
        await onSave(data)
        lastSavedDataRef.current = dataString

        if (updateUi) {
          setSaved(true)
          if (savedTimeoutRef.current) {
            clearTimeout(savedTimeoutRef.current)
          }
          savedTimeoutRef.current = setTimeout(() => {
            setSaved(false)
          }, savedIndicatorMs)
        }
      } catch (err) {
        console.error("Failed to save:", err)
      } finally {
        if (updateUi) {
          setSaving(false)
        }
      }
    },
    [onSave, serialize, savedIndicatorMs],
  )

  const handleChange = useCallback(
    (data: T) => {
      latestDataRef.current = data

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(() => {
        void performSave(data)
      }, debounceMs)
    },
    [performSave, debounceMs],
  )

  // Cleanup: flush pending save on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController()

    return () => {
      abortControllerRef.current?.abort()

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
        savedTimeoutRef.current = null
      }

      // Flush any pending changes without UI updates
      const latest = latestDataRef.current
      if (latest) {
        void performSave(latest, false)
      }
    }
  }, [performSave])

  return { saving, saved, handleChange }
}
