import { useCallback, useEffect, useRef } from "react"

interface DebouncedCallback<TArgs extends unknown[]> {
  run: (...args: TArgs) => void
  cancel: () => void
}

export function useDebounceCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void | Promise<void>,
  delayMs: number,
): DebouncedCallback<TArgs> {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  callbackRef.current = callback

  const run = useCallback(
    (...args: TArgs) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        void callbackRef.current(...args)
      }, delayMs)
    },
    [delayMs],
  )

  const cancel = useCallback(() => {
    if (!timeoutRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  return {
    run,
    cancel,
  }
}
