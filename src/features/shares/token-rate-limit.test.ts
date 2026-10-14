import { expect, test, vi } from "vitest"
import type { RateLimiter } from "@/lib/rate-limit"
import {
  FAILED_TOKEN_LOOKUPS_PER_MINUTE,
  recordFailedTokenLookup,
  tokenLookupsBlocked,
} from "./token-rate-limit"

// The limiter is process-wide on purpose (one budget per IP across both guest
// surfaces), so each test uses an address of its own rather than resetting it.
const from = (ip: string) => ({
  headers: new Headers({ "x-forwarded-for": ip }),
})

const fail = (visitor: ReturnType<typeof from>, times: number, now = 0) => {
  for (let i = 0; i < times; i++) recordFailedTokenLookup(visitor, now)
}

test("lookups with a live link never spend the budget", () => {
  const office = from("203.0.113.10")

  for (let i = 0; i < FAILED_TOKEN_LOOKUPS_PER_MINUTE * 10; i++) {
    expect(tokenLookupsBlocked(office, 0)).toBe(false)
  }
})

test("blocks lookups once a minute's worth of them failed", () => {
  const guesser = from("203.0.113.11")

  fail(guesser, FAILED_TOKEN_LOOKUPS_PER_MINUTE - 1)
  expect(tokenLookupsBlocked(guesser, 0)).toBe(false)
  fail(guesser, 1)
  expect(tokenLookupsBlocked(guesser, 0)).toBe(true)
})

test("the share page and the websocket upgrade share one budget", () => {
  const ip = "203.0.113.12"
  // Same visitor, arriving through the two different call sites: the loader
  // has forwarded headers, the upgrade may only have the socket address.
  fail(from(ip), FAILED_TOKEN_LOOKUPS_PER_MINUTE)

  expect(tokenLookupsBlocked({ headers: new Headers(), socketIp: ip }, 0)).toBe(
    true,
  )
})

test("one guessing visitor does not lock anyone else out", () => {
  fail(from("203.0.113.13"), FAILED_TOKEN_LOOKUPS_PER_MINUTE)

  expect(tokenLookupsBlocked(from("203.0.113.14"), 0)).toBe(false)
})

test("the budget refills the next minute", () => {
  const guesser = from("203.0.113.15")
  fail(guesser, FAILED_TOKEN_LOOKUPS_PER_MINUTE)

  expect(tokenLookupsBlocked(guesser, 60_000)).toBe(false)
})

// The websocket route and the server functions are separate bundles in the
// built server, so a second evaluation of this module must adopt the limiter
// the first one pinned — otherwise each surface quietly gets its own budget.
test("a second evaluation of the module adopts the limiter already in the process", async () => {
  const key = Symbol.for("excaliself.share-token-rate-limit")
  const host = globalThis as typeof globalThis & { [key]?: RateLimiter }
  const pinned = host[key]
  const stub: RateLimiter = {
    allow: vi.fn(() => true),
    exhausted: () => false,
    trackedKeys: () => 0,
  }
  host[key] = stub

  try {
    vi.resetModules()
    const reloaded = await import("./token-rate-limit")
    reloaded.recordFailedTokenLookup(from("203.0.113.20"), 0)
    expect(stub.allow).toHaveBeenCalledWith("203.0.113.20", 0)
  } finally {
    host[key] = pinned
    vi.resetModules()
  }
})
