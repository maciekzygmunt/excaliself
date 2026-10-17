import { expect, test } from "vitest"
import {
  roomFileUrl,
  roomPathForDrawing,
  roomPathForToken,
  roomSocketUrl,
} from "./room-url"

test("the room socket url follows the page's own origin and scheme", () => {
  const room = roomPathForToken("abc")
  expect(
    roomSocketUrl(room, { protocol: "https:", host: "draw.example.com" }),
  ).toBe("wss://draw.example.com/ws/rooms/abc")
  expect(
    roomSocketUrl(room, { protocol: "http:", host: "localhost:3000" }),
  ).toBe("ws://localhost:3000/ws/rooms/abc")
})

test("a Team drawing's room is reached by its id", () => {
  const room = roomPathForDrawing("d1")
  expect(
    roomSocketUrl(room, { protocol: "http:", host: "localhost:3000" }),
  ).toBe("ws://localhost:3000/ws/drawings/d1")
  expect(roomFileUrl(room, "file-1")).toBe("/api/drawings/d1/files/file-1")
})

test("a token is escaped into the path rather than pasted in raw", () => {
  expect(
    roomSocketUrl(roomPathForToken("a/../b"), {
      protocol: "http:",
      host: "localhost:3000",
    }),
  ).toBe("ws://localhost:3000/ws/rooms/a%2F..%2Fb")
})

test("an image's url is relative, so it rides the page's own origin", () => {
  expect(roomFileUrl(roomPathForToken("abc"), "file-1")).toBe(
    "/api/rooms/abc/files/file-1",
  )
})

test("both segments are escaped rather than pasted in raw", () => {
  expect(roomFileUrl(roomPathForToken("a/../b"), "../secret")).toBe(
    "/api/rooms/a%2F..%2Fb/files/..%2Fsecret",
  )
})
