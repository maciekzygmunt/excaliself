import { expect, test } from "vitest"
import { dataUrlToBytes } from "./file-bytes"

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>é #1</text></svg>'

test.each([
  [
    "base64",
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  ],
  ["URL-encoded", `data:image/svg+xml,${encodeURIComponent(svg)}`],
  ["raw utf8", `data:image/svg+xml;utf8,${svg.replace("#", "%23")}`],
  [
    "percent-escaped base64 with line breaks",
    `data:image/svg+xml;base64,${Buffer.from(svg)
      .toString("base64")
      .replace(/^P/, "%50")
      .replace(/(.{8})/, "$1\n")}`,
  ],
])("decodes a %s data URL to the image bytes", (_label, dataUrl) => {
  expect(dataUrlToBytes(dataUrl).toString()).toBe(svg)
})
