// Flush and close every Room on SIGTERM. Never exit here: srvx has its own handler
// that drains in-flight requests, and exiting would cut that short.

/** The slice of `process` this needs. */
export type ShutdownHost = {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown
}

/** SIGINT is for `pnpm dev`; a deploy sends SIGTERM. */
const SIGNALS = ["SIGTERM", "SIGINT"] as const

export function registerShutdownFlush(
  flush: () => Promise<void>,
  options: { host?: ShutdownHost } = {},
) {
  const host = options.host ?? process
  for (const signal of SIGNALS) {
    host.once(signal, () => {
      // The Room already logs failures; this only avoids an unhandled rejection.
      void flush().catch(() => {})
    })
  }
}
