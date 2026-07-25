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
  flushRef,
  paused = false,
  skipInitialChange = false,
}: {
  onSave: (payload: string) => Promise<unknown>
  onChangeRef: { current: ((data: string) => void) | null }
  flushRef?: { current: (() => Promise<void>) | null }
  paused?: boolean
  skipInitialChange?: boolean
}) {
  const { handleChange, flush } = useAutoSave<string, string>({
    toPayload: (d) => d,
    getSignature: (p) => p,
    onSave,
    paused,
    skipInitialChange,
  })
  onChangeRef.current = handleChange
  if (flushRef) flushRef.current = flush
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

// Regression: the re-check lived in per-mutate callbacks, which react-query
// drops after unmount — navigating away while a stale save was in flight
// lost the revert.
test("post-settle re-check still runs when the component unmounted mid-save", async () => {
  vi.useFakeTimers()
  const resolvers: Array<() => void> = []
  const onSave = vi.fn(
    () => new Promise<void>((resolve) => resolvers.push(resolve)),
  )
  const onChangeRef = { current: null as ((data: string) => void) | null }

  const { unmount } = render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("base"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  await act(async () => {
    resolvers[0]?.()
  })

  // "newer" save starts and stays in flight; the user undoes back to "base"
  // (skipped by dedup) and navigates away before the save settles.
  act(() => onChangeRef.current?.("newer"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  act(() => onChangeRef.current?.("base"))
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(onSave).toHaveBeenCalledTimes(2)
  await act(async () => {
    unmount()
  })

  // When "newer" commits after unmount, the re-check must still save "base".
  await act(async () => {
    resolvers[1]?.()
  })
  expect(onSave).toHaveBeenCalledTimes(3)
  expect(onSave).toHaveBeenLastCalledWith("base")
  vi.useRealTimers()
})

// Regression: while paused (corrupt-scene hold), edits were dropped entirely
// and the first post-pause change was eaten by skipInitialChange.
test("edits recorded while paused are saved once the pause lifts", async () => {
  vi.useFakeTimers()
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }

  const { rerender } = render(
    <Harness
      onSave={onSave}
      onChangeRef={onChangeRef}
      paused
      skipInitialChange
    />,
    { wrapper },
  )

  // First change is the as-loaded state (fingerprinted, never saved); the
  // second is a user edit made while still paused.
  act(() => onChangeRef.current?.("as-loaded"))
  act(() => onChangeRef.current?.("drawn-while-paused"))
  await act(async () => {
    vi.advanceTimersByTime(1000)
  })
  expect(onSave).not.toHaveBeenCalled()

  rerender(
    <Harness
      onSave={onSave}
      onChangeRef={onChangeRef}
      paused={false}
      skipInitialChange
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith("drawn-while-paused")
  vi.useRealTimers()
})

test("unpausing without edits does not save the as-loaded state", async () => {
  vi.useFakeTimers()
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }

  const { rerender } = render(
    <Harness
      onSave={onSave}
      onChangeRef={onChangeRef}
      paused
      skipInitialChange
    />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("as-loaded"))
  rerender(
    <Harness
      onSave={onSave}
      onChangeRef={onChangeRef}
      paused={false}
      skipInitialChange
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(1000)
  })
  expect(onSave).not.toHaveBeenCalled()
  vi.useRealTimers()
})

// --- the share-time handoff (canvas sharing spec §5.5) -------------------

test("flush commits a debounced edit without waiting out the delay", async () => {
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }
  const flushRef = { current: null as (() => Promise<void>) | null }

  render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} flushRef={flushRef} />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("drawn-just-before-sharing"))
  await act(async () => {
    await flushRef.current?.()
  })

  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith("drawn-just-before-sharing")
})

test("flush resolves only once the write has landed", async () => {
  const resolvers: Array<() => void> = []
  const onSave = vi.fn(
    () => new Promise<void>((resolve) => resolvers.push(resolve)),
  )
  const onChangeRef = { current: null as ((data: string) => void) | null }
  const flushRef = { current: null as (() => Promise<void>) | null }

  render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} flushRef={flushRef} />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("edit"))
  let settled = false
  await act(async () => {
    void flushRef.current?.().then(() => {
      settled = true
    })
  })
  // The share row must not be created while this is still in the air.
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)

  await act(async () => {
    resolvers[0]?.()
  })
  expect(settled).toBe(true)
})

test("flush with nothing outstanding resolves immediately", async () => {
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }
  const flushRef = { current: null as (() => Promise<void>) | null }

  render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} flushRef={flushRef} />,
    { wrapper },
  )

  await act(async () => {
    await flushRef.current?.()
  })

  expect(onSave).not.toHaveBeenCalled()
})
