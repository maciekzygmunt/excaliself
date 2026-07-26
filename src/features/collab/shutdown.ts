/**
 * The graceful-shutdown flush (canvas sharing spec §2.3, rollout note 3):
 * a container being replaced gets SIGTERM, and every live Room writes its
 * scene before the process goes away.
 *
 * Stopping the process is deliberately *not* this module's job. srvx — which
 * nitro's node server runs on — already installs its own SIGINT/SIGTERM
 * handler that closes the server and lets the event loop drain (a ~5 s
 * graceful window, `SERVER_SHUTDOWN_TIMEOUT`). Exiting here would cut that
 * short and drop requests still in flight; the flush is a handful of UPDATEs
 * and finishes long inside both that window and Docker's 10 s stop timeout.
 *
 * Split out of the websocket route (which imports the live db and nitro) so
 * it is drivable by a test.
 */

/** The slice of `process` this needs, so a test can pass a stand-in. */
export type ShutdownHost = {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown
}

/** SIGINT is here for `pnpm dev`; SIGTERM is the one a deploy sends. */
const SIGNALS = ["SIGTERM", "SIGINT"] as const

export function registerShutdownFlush(
  flush: () => Promise<void>,
  options: { host?: ShutdownHost } = {},
) {
  const host = options.host ?? process
  for (const signal of SIGNALS) {
    host.once(signal, () => {
      // A failed write is already logged and retried by the Room; catching
      // here only keeps it from surfacing as an unhandled rejection while the
      // process is on its way out.
      void flush().catch(() => {})
    })
  }
}
