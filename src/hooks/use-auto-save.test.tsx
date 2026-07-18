import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { expect, test, vi } from "vitest"
import { useAutoSave } from "./use-auto-save"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function Harness({
  onSave,
  onChangeRef,
}: {
  onSave: (payload: string) => Promise<unknown>
  onChangeRef: { current: ((data: string) => void) | null }
}) {
  const { handleChange } = useAutoSave<string, string>({
    toPayload: (d) => d,
    getSignature: (p) => p,
    onSave,
  })
  onChangeRef.current = handleChange
  return null
}

// Regression: unmounting inside the debounce window used to lose the pending
// edit — useDebounceCallback's own cleanup cancelled it before the flush ran.
test("pending edit is flushed to onSave on unmount", async () => {
  vi.useFakeTimers()
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }

  const { unmount } = render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("edited-scene"))
  act(() => vi.advanceTimersByTime(100))
  await act(async () => {
    unmount()
  })

  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith("edited-scene")
  vi.useRealTimers()
})

test("debounced edit saves after the delay while mounted", async () => {
  vi.useFakeTimers()
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }

  render(<Harness onSave={onSave} onChangeRef={onChangeRef} />, { wrapper })

  act(() => onChangeRef.current?.("edit-1"))
  act(() => onChangeRef.current?.("edit-2"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })

  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith("edit-2")
  vi.useRealTimers()
})

// Regression: reverting to the last-saved state while a newer save was in
// flight used to be skipped by the signature dedup — the in-flight save
// committed the newer state and the revert was never persisted.
test("state changed while a save was in flight is saved after it settles", async () => {
  vi.useFakeTimers()
  const resolvers: Array<() => void> = []
  const onSave = vi.fn(
    () => new Promise<void>((resolve) => resolvers.push(resolve)),
  )
  const onChangeRef = { current: null as ((data: string) => void) | null }

  render(<Harness onSave={onSave} onChangeRef={onChangeRef} />, { wrapper })

  // Commit "base" so the dedup signature points at it.
  act(() => onChangeRef.current?.("base"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(onSave).toHaveBeenCalledTimes(1)
  await act(async () => {
    resolvers[0]?.()
  })

  // Edit to "newer"; its save starts and stays in flight.
  act(() => onChangeRef.current?.("newer"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(onSave).toHaveBeenCalledTimes(2)

  // Undo back to "base" while "newer" is in flight — the dedup skips it
  // because "base" still matches the last committed signature.
  act(() => onChangeRef.current?.("base"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(onSave).toHaveBeenCalledTimes(2)

  // Once "newer" commits, the post-settle re-check must save "base".
  await act(async () => {
    resolvers[1]?.()
  })
  expect(onSave).toHaveBeenCalledTimes(3)
  expect(onSave).toHaveBeenLastCalledWith("base")
  vi.useRealTimers()
})
