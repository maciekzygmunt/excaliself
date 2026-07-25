import { expect, test, vi } from "vitest"
import type { RateLimiter } from "@/lib/rate-limit"
import {
  allowTokenValidation,
  TOKEN_VALIDATIONS_PER_MINUTE,
} from "./token-rate-limit"

// The limiter is process-wide on purpose (one budget per IP across both guest
// surfaces), so each test uses an address of its own rather than resetting it.
const from = (ip: string) => ({
  headers: new Headers({ "x-forwarded-for": ip }),
})

test("serves a minute's worth of validations, then refuses", () => {
  const visitor = from("203.0.113.10")

  for (let i = 0; i < TOKEN_VALIDATIONS_PER_MINUTE; i++) {
    expect(allowTokenValidation(visitor, 0)).toBe(true)
  }
  expect(allowTokenValidation(visitor, 0)).toBe(false)
})

test("the share page and the websocket upgrade share one budget", () => {
  const ip = "203.0.113.11"
  // Same visitor, arriving through the two different call sites: the loader
  // has forwarded headers, the upgrade may only have the socket address.
  for (let i = 0; i < TOKEN_VALIDATIONS_PER_MINUTE; i++) {
    expect(allowTokenValidation(from(ip), 0)).toBe(true)
  }
  expect(
    allowTokenValidation({ headers: new Headers(), socketIp: ip }, 0),
  ).toBe(false)
})

test("one flooding visitor does not lock anyone else out", () => {
  const flooder = from("203.0.113.12")
  for (let i = 0; i < TOKEN_VALIDATIONS_PER_MINUTE + 5; i++) {
    allowTokenValidation(flooder, 0)
  }

  expect(allowTokenValidation(from("203.0.113.13"), 0)).toBe(true)
})

test("the budget refills the next minute", () => {
  const visitor = from("203.0.113.14")
  for (let i = 0; i < TOKEN_VALIDATIONS_PER_MINUTE + 5; i++) {
    allowTokenValidation(visitor, 0)
  }

  expect(allowTokenValidation(visitor, 60_000)).toBe(true)
})

// The websocket route and the server functions are separate bundles in the
// built server, so a second evaluation of this module must adopt the limiter
// the first one pinned — otherwise each surface quietly gets its own 60/min.
test("a second evaluation of the module adopts the limiter already in the process", async () => {
  const key = Symbol.for("excaliself.share-token-rate-limit")
  const host = globalThis as typeof globalThis & { [key]?: RateLimiter }
  const pinned = host[key]
  const stub: RateLimiter = { allow: vi.fn(() => true), trackedKeys: () => 0 }
  host[key] = stub

  try {
    vi.resetModules()
    const reloaded = await import("./token-rate-limit")
    reloaded.allowTokenValidation(from("203.0.113.20"), 0)
    expect(stub.allow).toHaveBeenCalledWith("203.0.113.20", 0)
  } finally {
    host[key] = pinned
    vi.resetModules()
  }
})
