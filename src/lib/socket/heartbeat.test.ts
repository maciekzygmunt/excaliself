import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  createHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from "./heartbeat"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/**
 * A heartbeat plus the two logs its callbacks write. `answering` stands in
 * for the server: while it is true every ping is acknowledged where a real
 * `PONG` would land — inside the send, before any clock advances.
 */
function harness(overrides: { intervalMs?: number; timeoutMs?: number } = {}) {
  const pings: number[] = []
  let silent = 0
  let answering = true
  const heartbeat = createHeartbeat({
    ping: () => {
      pings.push(Date.now())
      if (answering) heartbeat.acknowledge()
    },
    onSilent: () => {
      silent += 1
    },
    ...overrides,
  })
  return {
    heartbeat,
    pings,
    silences: () => silent,
    goSilent: () => {
      answering = false
    },
  }
}

test("an answered socket is pinged on the interval, indefinitely", () => {
  const { heartbeat, pings, silences } = harness()
  heartbeat.start()

  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 10)

  expect(pings).toHaveLength(10)
  expect(silences()).toBe(0)
  // Well inside the 60 s idle timeout the heartbeat exists to stay ahead of.
  expect(HEARTBEAT_INTERVAL_MS).toBeLessThan(60_000)
})

test("an unanswered ping reports the socket dead — a half-open TCP connection", () => {
  const { heartbeat, silences, goSilent } = harness()
  heartbeat.start()
  goSilent()

  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
  expect(silences()).toBe(0)
  vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS)

  expect(silences()).toBe(1)
})

test("a slow answer inside the window is still an answer", () => {
  const { heartbeat, silences, goSilent } = harness()
  heartbeat.start()
  goSilent()

  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
  vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1)
  heartbeat.acknowledge()
  vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS)

  expect(silences()).toBe(0)
})

test("only one ping is outstanding at a time", () => {
  // With a timeout longer than the interval, a second beat lands while the
  // first is still waiting. Pinging again there would restart the clock the
  // dead socket is being measured against, and it would never be called dead.
  const { heartbeat, pings, silences, goSilent } = harness({
    intervalMs: 100,
    timeoutMs: 250,
  })
  heartbeat.start()
  goSilent()

  vi.advanceTimersByTime(360)

  expect(pings).toHaveLength(1)
  expect(silences()).toBe(1)
})

test("stopping ends both the pinging and the waiting", () => {
  const { heartbeat, pings, silences, goSilent } = harness()
  heartbeat.start()
  goSilent()
  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

  heartbeat.stop()
  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 4)

  expect(pings).toHaveLength(1)
  expect(silences()).toBe(0)
})

test("starting twice does not double the beat", () => {
  const { heartbeat, pings } = harness()
  heartbeat.start()
  heartbeat.start()

  vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

  expect(pings).toHaveLength(1)
})
