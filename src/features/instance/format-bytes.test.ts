import { expect, test } from "vitest"
import { formatBytes } from "./format-bytes"

test("zero bytes reads as 0 B", () => {
  expect(formatBytes(0)).toBe("0 B")
})

test("sub-kilobyte sizes stay in bytes", () => {
  expect(formatBytes(512)).toBe("512 B")
})

test("kilobyte sizes round to one decimal", () => {
  expect(formatBytes(1536)).toBe("1.5 KB")
})

test("whole units drop the trailing decimal", () => {
  expect(formatBytes(2048)).toBe("2 KB")
})

test("megabyte and gigabyte sizes pick the right unit", () => {
  expect(formatBytes(1572864)).toBe("1.5 MB")
  expect(formatBytes(3221225472)).toBe("3 GB")
})
