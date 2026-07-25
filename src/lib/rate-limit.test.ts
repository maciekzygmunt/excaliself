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
    maxTrackedKeys: 4,
  })

  for (let i = 0; i < 5; i++) limiter.allow(`10.0.0.${i}`, 0)
  expect(limiter.trackedKeys()).toBe(5)

  limiter.allow("10.0.1.1", MINUTE)
  expect(limiter.trackedKeys()).toBe(1)
})

test("sweeping never forgets a key that is still inside its window", () => {
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: MINUTE,
    maxTrackedKeys: 1,
  })

  limiter.allow("1.2.3.4", 0)
  limiter.allow("5.6.7.8", 0)
  expect(limiter.allow("1.2.3.4", 1)).toBe(false)
})
