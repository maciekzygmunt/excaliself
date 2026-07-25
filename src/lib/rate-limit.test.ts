import { expect, test } from "vitest"
import { createRateLimiter } from "./rate-limit"

const MINUTE = 60_000

test("allows up to the limit inside one window, then refuses", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: MINUTE })

  expect([1, 2, 3].map(() => limiter.allow("1.2.3.4", 0))).toEqual([
    true,
    true,
    true,
  ])
  expect(limiter.allow("1.2.3.4", 0)).toBe(false)
})

test("keeps refusing for the rest of the window", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: MINUTE })

  limiter.allow("1.2.3.4", 0)
  expect(limiter.allow("1.2.3.4", MINUTE - 1)).toBe(false)
})

test("a fresh window restores the full budget", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: MINUTE })

  limiter.allow("1.2.3.4", 0)
  expect(limiter.allow("1.2.3.4", MINUTE)).toBe(true)
})

test("one key's flood leaves every other key untouched", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: MINUTE })

  limiter.allow("1.2.3.4", 0)
  limiter.allow("1.2.3.4", 0)
  expect(limiter.allow("5.6.7.8", 0)).toBe(true)
})

// A limiter keyed by IP is fed keys by strangers, so the map has to shed
// expired entries — otherwise a long-lived process accumulates one entry per
// address that ever knocked.
test("sheds expired keys instead of growing forever", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: MINUTE,
    maxTrackedKeys: 10,
  })

  for (let i = 0; i < 10; i++) limiter.allow(`10.0.0.${i}`, 0)
  limiter.allow("10.0.1.1", MINUTE)

  expect(limiter.trackedKeys()).toBe(1)
})

// Without a hard ceiling, a caller rotating addresses inside one window would
// turn the limiter itself into the way to exhaust the process.
test("a flood of fresh keys is evicted down to the ceiling, not accumulated", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: MINUTE,
    maxTrackedKeys: 10,
  })

  for (let i = 0; i < 500; i++) limiter.allow(`10.0.${i}.1`, 0)

  expect(limiter.trackedKeys()).toBeLessThanOrEqual(10)
})

test("the key being counted is never the one evicted to make room", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: MINUTE,
    maxTrackedKeys: 2,
  })

  limiter.allow("1.2.3.4", 0)
  for (let i = 0; i < 10; i++) limiter.allow(`10.0.${i}.1`, 0)

  expect(limiter.allow("9.9.9.9", 0)).toBe(true)
  expect(limiter.allow("9.9.9.9", 0)).toBe(false)
})

test("a key inside its window keeps its count while there is room to spare", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: MINUTE,
    maxTrackedKeys: 10,
  })

  limiter.allow("1.2.3.4", 0)
  limiter.allow("5.6.7.8", 0)

  expect(limiter.allow("1.2.3.4", 1)).toBe(false)
})
