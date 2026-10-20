/**
 * A background job with no external cron: one pass now, then one per
 * interval. A pass returns a line to log, or null for nothing. Failures are
 * logged and never break the schedule. Returns a stop function (for tests).
 */
export function startIntervalJob(
  label: string,
  intervalMs: number,
  pass: () => Promise<string | null>,
): () => void {
  const run = async () => {
    try {
      const line = await pass()
      if (line !== null) console.log(`[${label}] ${line}`)
    } catch (err) {
      console.error(`[${label}] pass failed`, err)
    }
  }

  void run()
  const timer = setInterval(run, intervalMs)
  // Typed by the DOM lib as a number, but at runtime this is a Node Timeout;
  // unref it so the job never holds the process open (graceful shutdown).
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
}
