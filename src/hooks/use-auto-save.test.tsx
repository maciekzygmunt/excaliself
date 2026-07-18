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
  onSave: (data: string) => Promise<void>
  onChangeRef: { current: ((data: string) => void) | null }
}) {
  const { handleChange } = useAutoSave<string>({
    onSave,
    getSignature: (d) => d,
  })
  onChangeRef.current = handleChange
  return null
}

// Regression: unmounting inside the debounce window used to lose the pending
// edit — useDebounceCallback's own cleanup cancelled it before the flush ran.
test("pending edit is flushed to onSave on unmount", () => {
  vi.useFakeTimers()
  const onSave = vi.fn(() => Promise.resolve())
  const onChangeRef = { current: null as ((data: string) => void) | null }

  const { unmount } = render(
    <Harness onSave={onSave} onChangeRef={onChangeRef} />,
    { wrapper },
  )

  act(() => onChangeRef.current?.("edited-scene"))
  act(() => vi.advanceTimersByTime(100))
  unmount()

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
