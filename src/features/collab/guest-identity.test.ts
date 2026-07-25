import { expect, test } from "vitest"
import { GUEST_NAME_STORAGE_KEY, getOrCreateGuestName } from "./guest-identity"

const A_NAME = /^[A-Z][a-z]+ [A-Z][a-z]+$/

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
  const localStorage = fakeStorage()
  const first = getOrCreateGuestName({ localStorage })

  expect(first).toMatch(A_NAME)
  expect(localStorage.getItem(GUEST_NAME_STORAGE_KEY)).toBe(first)
  expect(getOrCreateGuestName({ localStorage })).toBe(first)
})

test("a stored name is sanitized on the way out", () => {
  const localStorage = fakeStorage({ [GUEST_NAME_STORAGE_KEY]: "  Wren\n " })
  expect(getOrCreateGuestName({ localStorage })).toBe("Wren")
})

test("storage blocked at the property itself still yields a usable name", () => {
  // Chrome throws SecurityError on the `localStorage` *property* when site
  // data is blocked — before any getItem/setItem guard could catch it.
  // Reading the property is this module's job precisely so that throw can
  // never escape into a caller's render.
  const blocked = {
    get localStorage(): Storage {
      throw new DOMException("blocked", "SecurityError")
    },
  }

  expect(() => getOrCreateGuestName(blocked)).not.toThrow()
  expect(getOrCreateGuestName(blocked)).toMatch(A_NAME)
})

test("storage that throws on use still yields a usable name", () => {
  const hostile = {
    localStorage: {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    } as unknown as Storage,
  }

  expect(getOrCreateGuestName(hostile)).toMatch(A_NAME)
})

test("a host without storage at all — server render, or a locked-down embed", () => {
  expect(getOrCreateGuestName({})).toMatch(A_NAME)
  expect(getOrCreateGuestName(null)).toMatch(A_NAME)
})
