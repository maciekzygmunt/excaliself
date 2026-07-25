import { expect, test } from "vitest"
import { roomSocketUrl } from "./room-url"

test("the room socket url follows the page's own origin and scheme", () => {
  expect(
    roomSocketUrl("abc", { protocol: "https:", host: "draw.example.com" }),
  ).toBe("wss://draw.example.com/ws/rooms/abc")
  expect(
    roomSocketUrl("abc", { protocol: "http:", host: "localhost:3000" }),
  ).toBe("ws://localhost:3000/ws/rooms/abc")
})

test("a token is escaped into the path rather than pasted in raw", () => {
  expect(
    roomSocketUrl("a/../b", { protocol: "http:", host: "localhost:3000" }),
  ).toBe("ws://localhost:3000/ws/rooms/a%2F..%2Fb")
})
