import { expect, test, vi } from "vitest"
import { createListUpdateHub } from "./hub"

test("a change reaches every open tab, and a closed one hears nothing", () => {
  const hub = createListUpdateHub()
  const ada = vi.fn()
  const bob = vi.fn()
  const removeAda = hub.add({ notify: ada, close: vi.fn() })
  hub.add({ notify: bob, close: vi.fn() })

  hub.notify()
  removeAda()
  hub.notify()

  expect(ada).toHaveBeenCalledOnce()
  expect(bob).toHaveBeenCalledTimes(2)
})
