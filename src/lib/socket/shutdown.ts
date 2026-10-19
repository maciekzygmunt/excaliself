// Close a socket route's peers on SIGTERM: srvx's drain skips upgraded sockets,
// so open ones would keep the old process alive. Never exit here: srvx has its
// own handler that drains in-flight requests, and exiting would cut that short.

/** Standard "Service Restart". Clients retry it like any outage. */
export const SERVER_RESTART_CLOSE_CODE = 1012

export const SERVER_RESTART_CLOSE_REASON = "Server restarting"

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
      // Callers log their own failures; this only avoids an unhandled rejection.
      void flush().catch(() => {})
    })
  }
}
