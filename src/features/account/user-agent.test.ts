import { expect, test } from "vitest"
import { describeDevice } from "./user-agent"

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (Version/17.4 Safari/605.1.15"
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

test("labels browser and OS from common user agents", () => {
  expect(describeDevice(CHROME_MAC)).toBe("Chrome on macOS")
  expect(describeDevice(SAFARI_MAC)).toBe("Safari on macOS")
  expect(describeDevice(SAFARI_IPHONE)).toBe("Safari on iOS")
  expect(describeDevice(FIREFOX_WINDOWS)).toBe("Firefox on Windows")
  expect(describeDevice(EDGE_WINDOWS)).toBe("Edge on Windows")
  expect(describeDevice(CHROME_ANDROID)).toBe("Chrome on Android")
  expect(describeDevice(CHROME_LINUX)).toBe("Chrome on Linux")
})

test("degrades to just the browser when the OS is unrecognized", () => {
  expect(describeDevice("SomethingNew/1.0 Firefox/126.0")).toBe("Firefox")
})

test("degrades to just the OS when the browser is unrecognized", () => {
  expect(describeDevice("curl-ish (Windows NT 10.0)")).toBe("Windows")
})

test("falls back to Unknown device for missing or opaque agents", () => {
  expect(describeDevice(null)).toBe("Unknown device")
  expect(describeDevice("")).toBe("Unknown device")
  expect(describeDevice("totally-opaque/1.0")).toBe("Unknown device")
})
