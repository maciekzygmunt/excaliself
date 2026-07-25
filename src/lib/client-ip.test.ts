import { expect, test } from "vitest"
import { clientIpKey } from "./client-ip"

const headers = (init: Record<string, string>) => new Headers(init)

test("uses the socket address when nothing is proxying", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: "203.0.113.7" })).toBe(
    "203.0.113.7",
  )
})

test("prefers what the reverse proxy forwarded", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": "203.0.113.7" }),
      socketIp: "172.18.0.2",
    }),
  ).toBe("203.0.113.7")
})

// Traefik appends the peer it saw to whatever arrived, so a client that sends
// its own header only ever pushes junk to the left of the real address.
test("takes the last hop of a forwarded chain, not the client-supplied head", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }),
      socketIp: "172.18.0.2",
    }),
  ).toBe("203.0.113.7")
})

test("falls back to x-real-ip", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-real-ip": "203.0.113.7" }),
      socketIp: "172.18.0.2",
    }),
  ).toBe("203.0.113.7")
})

test("ignores an empty or whitespace-only forwarded header", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": " , " }),
      socketIp: "203.0.113.7",
    }),
  ).toBe("203.0.113.7")
})

test("falls back to one shared bucket when no address can be read", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: null })).toBe("unknown")
})
