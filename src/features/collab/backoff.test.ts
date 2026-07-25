import { expect, test } from "vitest"
import {
  createReconnectBackoff,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./backoff"

/** A deterministic stand-in for Math.random, cycling through fixed draws. */
const draws = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

test("the first wait is around a second, not instant", () => {
  const backoff = createReconnectBackoff(draws(0))
  // The floor, with the jitter drawing its lowest value: half the base.
  expect(backoff.next()).toBe(RECONNECT_BASE_DELAY_MS / 2)
})

test("waits double until they hit the cap, then stay there", () => {
  // random() === 1 is the top of every window, so this reads as the ceiling.
  const backoff = createReconnectBackoff(draws(1))
  const waits = Array.from({ length: 8 }, () => backoff.next())

  expect(waits).toEqual([
    1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000, 10_000,
  ])
  expect(RECONNECT_MAX_DELAY_MS).toBe(10_000)
})

test("every wait is jittered — two clients never come back in lockstep", () => {
  const low = createReconnectBackoff(draws(0))
  const high = createReconnectBackoff(draws(1))

  // Same attempt number, different draw, different wait — and the low draw is
  // still at least half the window, so a herd spreads instead of hammering.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const lowWait = low.next()
    const highWait = high.next()
    expect(lowWait).toBeLessThan(highWait)
    expect(lowWait).toBeGreaterThanOrEqual(highWait / 2)
  }
})

test("a wait never exceeds the cap, whatever the draw", () => {
  const backoff = createReconnectBackoff(draws(0.13, 0.99, 0.5, 0.77))
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const wait = backoff.next()
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(RECONNECT_MAX_DELAY_MS)
  }
})

test("a successful connection puts the next outage back at the start", () => {
  const backoff = createReconnectBackoff(draws(1))
  backoff.next()
  backoff.next()
  backoff.next()

  backoff.reset()

  expect(backoff.next()).toBe(RECONNECT_BASE_DELAY_MS)
})
