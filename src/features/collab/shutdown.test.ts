import { expect, test, vi } from "vitest"
import { registerShutdownFlush, type ShutdownHost } from "./shutdown"

/** Stands in for `process`: captures the handlers, fires one on demand. */
function fakeHost() {
  const handlers = new Map<string, () => void>()
  const host: ShutdownHost = {
    once: (signal, listener) => handlers.set(signal, listener),
  }
  return {
    host,
    signals: () => [...handlers.keys()],
    signal: (name: "SIGTERM" | "SIGINT") => handlers.get(name)?.(),
  }
}

test("SIGTERM flushes every room", async () => {
  const { host, signal } = fakeHost()
  const flush = vi.fn(() => Promise.resolve())
  registerShutdownFlush(flush, { host })

  signal("SIGTERM")

  expect(flush).toHaveBeenCalledTimes(1)
})

test("Ctrl-C in dev flushes too", () => {
  const { host, signals, signal } = fakeHost()
  const flush = vi.fn(() => Promise.resolve())
  registerShutdownFlush(flush, { host })

  expect(signals()).toEqual(["SIGTERM", "SIGINT"])
  signal("SIGINT")
  expect(flush).toHaveBeenCalledTimes(1)
})

// The process is stopping either way — srvx owns that — so a write that
// fails here must not surface as an unhandled rejection on the way out.
test("a flush that throws is swallowed", async () => {
  const { host, signal } = fakeHost()
  const rejections: unknown[] = []
  const onRejection = (error: unknown) => rejections.push(error)
  process.on("unhandledRejection", onRejection)
  try {
    registerShutdownFlush(
      async () => {
        throw new Error("database is down")
      },
      { host },
    )

    signal("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(rejections).toEqual([])
  } finally {
    process.off("unhandledRejection", onRejection)
  }
})
