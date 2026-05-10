import { useCallback, useEffect, useRef } from "react"

type DebouncedCallback<TArgs extends unknown[]> = {
  /** Schedule (or reschedule) the callback to fire after the delay. */
  run: (...args: TArgs) => void
  /** Drop any pending invocation. */
  cancel: () => void
  /** Run any pending invocation immediately (e.g. on unmount). */
  flush: () => void
}

export function useDebounceCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void | Promise<void>,
  delayMs: number,
): DebouncedCallback<TArgs> {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgsRef = useRef<TArgs | null>(null)

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    pendingArgsRef.current = null
  }, [])

  const flush = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    const args = pendingArgsRef.current
    pendingArgsRef.current = null
    if (args) void callbackRef.current(...args)
  }, [])

  const run = useCallback(
    (...args: TArgs) => {
      pendingArgsRef.current = args
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        const queued = pendingArgsRef.current
        pendingArgsRef.current = null
        if (queued) void callbackRef.current(...queued)
      }, delayMs)
    },
    [delayMs],
  )

  useEffect(() => cancel, [cancel])

  return { run, cancel, flush }
}
