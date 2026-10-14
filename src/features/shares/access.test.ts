import { expect, test } from "vitest"
import { resolveShareAccess } from "./access"

const liveDrawing = { deletedAt: null }
const trashedDrawing = { deletedAt: new Date("2026-07-01") }

test("an unknown token is dead", () => {
  expect(resolveShareAccess({ share: null, hasSession: true })).toBe("dead")
})

test("a trashed drawing is dead for every audience, session or not", () => {
  for (const audience of ["members", "anyone"] as const) {
    for (const hasSession of [true, false]) {
      expect(
        resolveShareAccess({
          share: { audience, drawing: trashedDrawing },
          hasSession,
        }),
      ).toBe("dead")
    }
  }
})

test("every dead reason yields the identical verdict — nothing distinguishes never-existed from trashed", () => {
  const unknownToken = resolveShareAccess({
    share: null,
    hasSession: false,
  })
  const trashed = resolveShareAccess({
    share: { audience: "anyone", drawing: trashedDrawing },
    hasSession: false,
  })
  expect(unknownToken).toBe(trashed)
})

test("a members-only link without a session asks for sign-in", () => {
  expect(
    resolveShareAccess({
      share: { audience: "members", drawing: liveDrawing },
      hasSession: false,
    }),
  ).toBe("signin")
})

test("a members-only link with a session opens", () => {
  expect(
    resolveShareAccess({
      share: { audience: "members", drawing: liveDrawing },
      hasSession: true,
    }),
  ).toBe("ok")
})

test("an anyone link opens without a session", () => {
  expect(
    resolveShareAccess({
      share: { audience: "anyone", drawing: liveDrawing },
      hasSession: false,
    }),
  ).toBe("ok")
})
