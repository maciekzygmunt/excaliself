import { expect, test } from "vitest"
import { resolveRoomJoin } from "./join"

const drawing = { id: "drawing-1", deletedAt: null }
const trashed = { id: "drawing-1", deletedAt: new Date("2026-07-01") }
const ada = { id: "user-ada", name: "Ada Lovelace", email: "ada@x.dev" }

test("a member joins an anyone link under their session name", () => {
  expect(
    resolveRoomJoin({ share: { audience: "anyone", drawing }, user: ada }),
  ).toEqual({
    status: "ok",
    roomId: "drawing-1",
    identity: { userId: "user-ada", displayName: "Ada Lovelace" },
  })
})

test("a guest joins an anyone link with no identity of its own", () => {
  expect(
    resolveRoomJoin({ share: { audience: "anyone", drawing }, user: null }),
  ).toEqual({
    status: "ok",
    roomId: "drawing-1",
    identity: { userId: null, displayName: null },
  })
})

test("a members-only link refuses a guest but admits a member", () => {
  expect(
    resolveRoomJoin({ share: { audience: "members", drawing }, user: null }),
  ).toEqual({ status: "refused" })
  expect(
    resolveRoomJoin({ share: { audience: "members", drawing }, user: ada }),
  ).toMatchObject({ status: "ok" })
})

test("an unknown token is refused", () => {
  expect(resolveRoomJoin({ share: null, user: ada })).toEqual({
    status: "refused",
  })
})

test("a trashed drawing goes dark for members and guests alike", () => {
  for (const audience of ["members", "anyone"] as const) {
    for (const user of [ada, null]) {
      expect(
        resolveRoomJoin({ share: { audience, drawing: trashed }, user }),
      ).toEqual({ status: "refused" })
    }
  }
})

test("the room is the drawing, so two tokens for one drawing meet in one room", () => {
  const first = resolveRoomJoin({
    share: { audience: "anyone", drawing },
    user: null,
  })
  const second = resolveRoomJoin({
    share: { audience: "members", drawing },
    user: ada,
  })
  expect(first).toMatchObject({ roomId: "drawing-1" })
  expect(second).toMatchObject({ roomId: "drawing-1" })
})
