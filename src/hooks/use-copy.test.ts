import { afterEach, expect, test, vi } from "vitest"
import { copyText } from "./use-copy"

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, "execCommand")
})

// Plain HTTP (a LAN self-host) has no navigator.clipboard at all.
test("copies through execCommand where the Clipboard API is missing", async () => {
  vi.stubGlobal("navigator", { ...navigator, clipboard: undefined })
  let selected = ""
  const execCommand = vi.fn(() => {
    selected = document.querySelector("textarea")?.value ?? ""
    return true
  })
  Object.assign(document, { execCommand })

  expect(await copyText("exs_token")).toBe(true)
  expect(execCommand).toHaveBeenCalledWith("copy")
  expect(selected).toBe("exs_token")
})

test("reports failure when neither way can copy", async () => {
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText: () => Promise.reject(new Error("denied")) },
  })
  Object.assign(document, { execCommand: () => false })

  expect(await copyText("exs_token")).toBe(false)
})
