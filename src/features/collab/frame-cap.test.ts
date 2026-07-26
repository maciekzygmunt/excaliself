import { expect, test } from "vitest"
import { exceedsFrameCap, MAX_FRAME_BYTES, utf8ByteLength } from "./frame-cap"

test("the frame cap decides small frames without measuring them", () => {
  // Every ordinary frame is ASCII and nowhere near the cap.
  expect(exceedsFrameCap('{"type":"PING"}')).toBe(false)
  expect(exceedsFrameCap("a".repeat(MAX_FRAME_BYTES))).toBe(false)
  expect(exceedsFrameCap("a".repeat(MAX_FRAME_BYTES + 1))).toBe(true)
})

test("the frame cap counts bytes, not characters", () => {
  // Three bytes each in UTF-8, one code unit each in UTF-16: a string well
  // under the cap by length and just over it by size.
  const overByBytes = "☃".repeat(Math.floor(MAX_FRAME_BYTES / 3) + 1)
  expect(overByBytes.length).toBeLessThan(MAX_FRAME_BYTES)
  expect(exceedsFrameCap(overByBytes)).toBe(true)
  expect(utf8ByteLength("☃")).toBe(3)
})

test("the frame cap reads binary frames off their byte length", () => {
  expect(exceedsFrameCap(new Uint8Array(MAX_FRAME_BYTES))).toBe(false)
  expect(exceedsFrameCap(new Uint8Array(MAX_FRAME_BYTES + 1))).toBe(true)
  expect(exceedsFrameCap(new ArrayBuffer(MAX_FRAME_BYTES + 1))).toBe(true)
})
