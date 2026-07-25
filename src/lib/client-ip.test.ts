import { expect, test } from "vitest"
import { clientIpKey } from "./client-ip"

const headers = (init: Record<string, string>) => new Headers(init)

/** What a reverse proxy on the app's own network looks like as a peer. */
const PROXY = "172.18.0.2"

test("uses the socket address when nothing is proxying", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: "203.0.113.7" })).toBe(
    "203.0.113.7",
  )
})

test("prefers what the reverse proxy forwarded", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": "203.0.113.7" }),
      socketIp: PROXY,
    }),
  ).toBe("203.0.113.7")
})

// Traefik appends the peer it saw to whatever arrived, so a client that sends
// its own header only ever pushes junk to the left of the real address.
test("takes the last hop of a forwarded chain, not the client-supplied head", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }),
      socketIp: PROXY,
    }),
  ).toBe("203.0.113.7")
})

// The documented docker-compose publishes port 3000 straight out. Believing a
// header there would hand a flooder a fresh budget on every request.
test("ignores forwarding headers a visitor sent us directly", () => {
  expect(
    clientIpKey({
      headers: headers({
        "x-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
      }),
      socketIp: "203.0.113.7",
    }),
  ).toBe("203.0.113.7")
})

test("trusts a proxy on loopback and on every private range", () => {
  for (const proxy of ["127.0.0.1", "::1", "::ffff:10.0.0.4", "192.168.1.9"]) {
    expect(
      clientIpKey({
        headers: headers({ "x-forwarded-for": "203.0.113.7" }),
        socketIp: proxy,
      }),
    ).toBe("203.0.113.7")
  }
})

test("falls back to x-real-ip", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-real-ip": "203.0.113.7" }),
      socketIp: PROXY,
    }),
  ).toBe("203.0.113.7")
})

test("a proxy that forwarded nothing is keyed as itself, not as everyone", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: PROXY })).toBe(PROXY)
})

test("ignores an empty or whitespace-only forwarded header", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": " , " }),
      socketIp: PROXY,
    }),
  ).toBe(PROXY)
})

// A proxy that sets the header but leaves it empty would otherwise put every
// visitor in one bucket named "" — the shape of a self-inflicted lockout.
test("a blank x-real-ip is treated as absent, not as everyone's address", () => {
  expect(
    clientIpKey({ headers: headers({ "x-real-ip": "  " }), socketIp: PROXY }),
  ).toBe(PROXY)
})

// The vite dev server exposes no peer, so the header is the only signal left.
test("reads the header when the runtime reports no peer at all", () => {
  expect(
    clientIpKey({
      headers: headers({ "x-forwarded-for": "203.0.113.7, 127.0.0.1" }),
      socketIp: null,
    }),
  ).toBe("127.0.0.1")
})

test("falls back to one shared bucket when no address can be read", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: null })).toBe("unknown")
})

test("a blank socket address falls through to the shared bucket", () => {
  expect(clientIpKey({ headers: headers({}), socketIp: "" })).toBe("unknown")
})
