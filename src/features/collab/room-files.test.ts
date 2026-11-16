import { expect, test } from "vitest"
import {
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BODY_BYTES,
  parseFilePayload,
  parseFileUpload,
} from "./room-files"

/** A data URL whose decoded payload is exactly `bytes` long. */
const imageOf = (bytes: number, mimeType = "image/png") =>
  `data:${mimeType};base64,${Buffer.alloc(bytes).toString("base64")}`

test("accepts an image data URL and reads the mime type out of it", () => {
  const parsed = parseFileUpload("abc123", {
    dataUrl: imageOf(8, "image/webp"),
  })

  expect(parsed).toEqual({
    status: "ok",
    file: {
      fileId: "abc123",
      mimeType: "image/webp",
      dataUrl: imageOf(8, "image/webp"),
    },
  })
})

test("counts decoded bytes, not the base64 that carries them", () => {
  // Right at the cap the base64 is a third larger than the limit — measuring
  // the encoding instead would refuse an image that is exactly 2 MB.
  const atCap = imageOf(MAX_IMAGE_BYTES)
  expect(atCap.length).toBeGreaterThan(MAX_IMAGE_BYTES)

  expect(parseFileUpload("abc123", { dataUrl: atCap }).status).toBe("ok")
})

test("refuses an image over the per-image cap", () => {
  expect(
    parseFileUpload("abc123", { dataUrl: imageOf(MAX_IMAGE_BYTES + 1) }).status,
  ).toBe("too-large")
})

test("the body ceiling leaves room for the largest legal image", () => {
  const percentEncoded = `data:image/svg+xml,${"%20".repeat(MAX_IMAGE_BYTES)}`
  for (const dataUrl of [imageOf(MAX_IMAGE_BYTES), percentEncoded]) {
    expect(JSON.stringify({ dataUrl }).length).toBeLessThanOrEqual(
      MAX_UPLOAD_BODY_BYTES,
    )
  }
})

test.each([
  ["a body that isn't an object", "not-an-object"],
  ["a missing dataUrl", {}],
  ["a non-string dataUrl", { dataUrl: 42 }],
  ["something that isn't a data URL", { dataUrl: "https://evil.test/x.png" }],
  ["an empty payload", { dataUrl: "data:image/png;base64," }],
  ["an empty URL-encoded payload", { dataUrl: "data:image/svg+xml," }],
  ["base64 with stray characters", { dataUrl: "data:image/png;base64,QU*D" }],
  [
    "a truncated base64 payload",
    { dataUrl: "data:image/png;base64,QUJD" + "Q" },
  ],
])("rejects %s", (_label, body) => {
  expect(parseFileUpload("abc123", body).status).toBe("invalid")
})

test("rejects a mime type that isn't an image excalidraw stores", () => {
  expect(
    parseFileUpload("abc123", { dataUrl: imageOf(8, "text/html") }).status,
  ).toBe("invalid")
})

test("rejects a fileId that isn't shaped like a content hash", () => {
  for (const fileId of ["", "../../etc/passwd", "a b", "x".repeat(129)]) {
    expect(parseFileUpload(fileId, { dataUrl: imageOf(8) }).status).toBe(
      "invalid",
    )
  }
})

test("an oversize body that is also malformed reads as a 400, not a 413", () => {
  // Ordering matters: a 413 tells the uploader "your image is too big", and
  // that must not be the answer to a body that was never an image.
  expect(
    parseFileUpload("abc123", {
      dataUrl: `data:text/html;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`,
    }).status,
  ).toBe("invalid")
})

test.each([
  ["URL-encoded", `data:image/svg+xml,${encodeURIComponent("<svg/>")}`],
  ["raw utf8", "data:image/svg+xml;utf8,<svg/>"],
  [
    "unpadded base64 with a mixed-case header",
    "data:Image/SVG+xml;BASE64,PHN2Zy8+",
  ],
])("accepts a %s SVG an imported file can carry", (_label, dataUrl) => {
  expect(parseFileUpload("abc123", { dataUrl })).toEqual({
    status: "ok",
    file: { fileId: "abc123", mimeType: "image/svg+xml", dataUrl },
  })
})

test("measures a URL-encoded image by its decoded bytes", () => {
  // Every byte is a 3-char escape, so the URL is 3x the cap.
  const svgOf = (bytes: number) => `data:image/svg+xml,${"%20".repeat(bytes)}`

  expect(
    parseFileUpload("abc123", { dataUrl: svgOf(MAX_IMAGE_BYTES) }).status,
  ).toBe("ok")
  expect(
    parseFileUpload("abc123", { dataUrl: svgOf(MAX_IMAGE_BYTES + 1) }).status,
  ).toBe("too-large")
})

test("parses a GET payload and defaults a missing timestamp", () => {
  expect(
    parseFilePayload({
      fileId: "abc123",
      mimeType: "image/png",
      dataUrl: imageOf(8),
      created: 1234,
    }),
  ).toEqual({
    fileId: "abc123",
    mimeType: "image/png",
    dataUrl: imageOf(8),
    created: 1234,
  })

  expect(
    parseFilePayload({
      fileId: "abc123",
      mimeType: "image/png",
      dataUrl: imageOf(8),
    })?.created,
  ).toBe(0)
})

test.each([
  ["null", null],
  ["a string", "nope"],
  ["a payload with no fileId", { mimeType: "image/png", dataUrl: "x" }],
  ["a payload with no bytes", { fileId: "a", mimeType: "image/png" }],
])("refuses to hand %s to addFiles", (_label, value) => {
  expect(parseFilePayload(value)).toBeNull()
})
