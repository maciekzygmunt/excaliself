import { expect, test } from "vitest"
import { createDroppableThrottle } from "./throttle"

test("the cursor throttle passes the first update and drops the rest of the window", () => {
  let clock = 1000
  const allow = createDroppableThrottle(33, () => clock)

  expect(allow()).toBe(true)
  clock += 10
  expect(allow()).toBe(false)
  clock += 10
  expect(allow()).toBe(false)
  clock += 20
  expect(allow()).toBe(true)
})

test("the very first update is never held back", () => {
  const allow = createDroppableThrottle(33, () => 0)
  expect(allow()).toBe(true)
})
