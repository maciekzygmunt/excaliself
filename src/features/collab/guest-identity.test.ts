import { expect, test } from "vitest"
import { GUEST_NAME_STORAGE_KEY, getOrCreateGuestName } from "./guest-identity"
import { roomSocketUrl } from "./room-url"
import { createDroppableThrottle } from "./throttle"

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } satisfies Storage
}

test("a guest's name is generated once and remembered", () => {
  const storage = fakeStorage()
  const first = getOrCreateGuestName(storage)

  expect(first).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  expect(storage.getItem(GUEST_NAME_STORAGE_KEY)).toBe(first)
  expect(getOrCreateGuestName(storage)).toBe(first)
})

test("a stored name is sanitized on the way out", () => {
  const storage = fakeStorage({ [GUEST_NAME_STORAGE_KEY]: "  Wren\n " })
  expect(getOrCreateGuestName(storage)).toBe("Wren")
})

test("unwritable storage still yields a usable name", () => {
  const hostile = {
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
  } as unknown as Storage

  expect(getOrCreateGuestName(hostile)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  expect(getOrCreateGuestName(null)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
})

test("the room socket url follows the page's own origin and scheme", () => {
  expect(
    roomSocketUrl("abc", { protocol: "https:", host: "draw.example.com" }),
  ).toBe("wss://draw.example.com/ws/rooms/abc")
  expect(
    roomSocketUrl("abc", { protocol: "http:", host: "localhost:3000" }),
  ).toBe("ws://localhost:3000/ws/rooms/abc")
})

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
