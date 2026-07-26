import { expect, test } from "vitest"
import { allowImageUpload, IMAGE_UPLOADS_PER_MINUTE } from "./upload-rate-limit"

// The limiter is process-wide on purpose, so each test uses an address and a
// room of its own rather than resetting it.
const from = (ip: string, roomId: string) => ({
  headers: new Headers({ "x-forwarded-for": ip }),
  roomId,
})

test("serves a minute's worth of uploads, then refuses", () => {
  const uploader = from("203.0.113.20", "drawing-a")

  for (let i = 0; i < IMAGE_UPLOADS_PER_MINUTE; i++) {
    expect(allowImageUpload(uploader, 0)).toBe(true)
  }
  expect(allowImageUpload(uploader, 0)).toBe(false)
})

test("the budget is per room, so one busy room doesn't close another", () => {
  const ip = "203.0.113.21"
  for (let i = 0; i < IMAGE_UPLOADS_PER_MINUTE + 5; i++) {
    allowImageUpload(from(ip, "drawing-b"), 0)
  }

  expect(allowImageUpload(from(ip, "drawing-c"), 0)).toBe(true)
})

test("two visitors in one room have budgets of their own", () => {
  for (let i = 0; i < IMAGE_UPLOADS_PER_MINUTE + 5; i++) {
    allowImageUpload(from("203.0.113.22", "drawing-d"), 0)
  }

  expect(allowImageUpload(from("203.0.113.23", "drawing-d"), 0)).toBe(true)
})

test("the window rolls forward", () => {
  const uploader = from("203.0.113.24", "drawing-e")
  for (let i = 0; i < IMAGE_UPLOADS_PER_MINUTE + 5; i++) {
    allowImageUpload(uploader, 0)
  }

  expect(allowImageUpload(uploader, 60_000)).toBe(true)
})
