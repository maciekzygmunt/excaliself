import { afterEach, expect, test } from "vitest"
import { baseLocale, overwriteGetLocale } from "@/paraglide/runtime"
import { describeContents } from "./destroy-copy"

afterEach(() => overwriteGetLocale(() => baseLocale))

test("joins counts as one phrase", () => {
  expect(describeContents(3, 2)).toBe("3 drawings and 2 folders")
  expect(describeContents(1, 0)).toBe("1 drawing")
  expect(describeContents(0, 0)).toBeNull()
})

// Polish has three count forms: 1 rysunek, 2 rysunki, 5 rysunków.
test("uses the Polish plural forms and list word", () => {
  overwriteGetLocale(() => "pl-PL")
  expect(describeContents(1, 0)).toBe("1 rysunek")
  expect(describeContents(2, 5)).toBe("2 rysunki i 5 folderów")
})
