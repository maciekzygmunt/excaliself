import { expect, test } from "vitest"
import { isStale, withEdit } from "./apply"

const el = (id: string, version: number) => ({ id, version })

test("stale once a changed element moved on or is gone", () => {
  const scene = [el("a", 3), el("b", 1)]
  expect(isStale(scene, { a: 3 })).toBe(false)
  expect(isStale(scene, { a: 2 })).toBe(true)
  expect(isStale(scene, { c: 1 })).toBe(true)
})

test("replaces changed elements in place and puts new ones on top", () => {
  const scene = [el("a", 3), el("b", 1)]
  expect(withEdit(scene, [el("new", 1), el("a", 4)])).toEqual([
    el("a", 4),
    el("b", 1),
    el("new", 1),
  ])
})
