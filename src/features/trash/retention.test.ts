import { expect, test } from "vitest"
import { daysUntilPurge, purgeCountdownLabel } from "./retention"

const NOW = new Date("2026-07-20T12:00:00Z").getTime()
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000)

test("a fresh trashing has the full 30-day window", () => {
  expect(daysUntilPurge(daysAgo(0), NOW)).toBe(30)
  expect(purgeCountdownLabel(daysAgo(0), NOW)).toBe("Purges in 30 days")
})

test("partial days round up — 4.5 days elapsed still reads 26", () => {
  expect(purgeCountdownLabel(daysAgo(4.5), NOW)).toBe("Purges in 26 days")
})

test("the last day is singular", () => {
  expect(purgeCountdownLabel(daysAgo(29.5), NOW)).toBe("Purges in 1 day")
})

test("due (or overdue for the purge job) reads today", () => {
  expect(purgeCountdownLabel(daysAgo(30), NOW)).toBe("Purges today")
  expect(purgeCountdownLabel(daysAgo(40), NOW)).toBe("Purges today")
})

test("accepts the ISO string form the wire may deliver", () => {
  expect(purgeCountdownLabel(daysAgo(10).toISOString(), NOW)).toBe(
    "Purges in 20 days",
  )
})
