import { expect, test } from "vitest"
import type { SceneElement } from "./protocol"
import { getSceneVersion, reconcileElements } from "./reconcile"

const NOTHING_BEING_EDITED = {}

function element(
  id: string,
  version: number,
  extra: Partial<SceneElement> = {},
): SceneElement {
  return { id, version, versionNonce: 1, index: "a0", ...extra }
}

const idsOf = (elements: SceneElement[]) => elements.map((e) => e.id)

test("an element nobody has seen before is taken as-is", () => {
  const reconciled = reconcileElements(
    [],
    [element("rect", 1)],
    NOTHING_BEING_EDITED,
  )

  expect(idsOf(reconciled)).toEqual(["rect"])
})

test("the higher version wins, whichever side it is on", () => {
  const local = element("rect", 5, { text: "local" })
  const remote = element("rect", 6, { text: "remote" })

  expect(reconcileElements([local], [remote], NOTHING_BEING_EDITED)).toEqual([
    remote,
  ])
  expect(reconcileElements([remote], [local], NOTHING_BEING_EDITED)).toEqual([
    remote,
  ])
})

test("a tie is broken by the lower versionNonce, so both sides pick the same winner", () => {
  const mine = element("rect", 7, { versionNonce: 10, text: "mine" })
  const theirs = element("rect", 7, { versionNonce: 99, text: "theirs" })

  // Whoever is holding which copy, the low-nonce element is the survivor.
  expect(reconcileElements([mine], [theirs], NOTHING_BEING_EDITED)).toEqual([
    mine,
  ])
  expect(reconcileElements([theirs], [mine], NOTHING_BEING_EDITED)).toEqual([
    mine,
  ])
})

test("an element being edited locally is never overwritten by a remote one", () => {
  const local = element("rect", 1, { text: "still typing" })
  const remote = element("rect", 99, { text: "clobber" })

  for (const editing of [
    { editingTextElement: { id: "rect" } },
    { resizingElement: { id: "rect" } },
    { newElement: { id: "rect" } },
  ]) {
    expect(reconcileElements([local], [remote], editing)).toEqual([local])
  }
})

test("editing one element does not shield the others", () => {
  const reconciled = reconcileElements(
    [element("rect", 1, { index: "a0" }), element("note", 1, { index: "a1" })],
    [element("note", 2, { index: "a1", text: "remote" })],
    { editingTextElement: { id: "rect" } },
  )

  expect(reconciled).toEqual([
    element("rect", 1, { index: "a0" }),
    element("note", 2, { index: "a1", text: "remote" }),
  ])
})

test("a delete lands like any other edit — the later version wins", () => {
  const alive = element("rect", 3)
  const deleted = element("rect", 4, { isDeleted: true })

  expect(reconcileElements([alive], [deleted], NOTHING_BEING_EDITED)).toEqual([
    deleted,
  ])
  // ...and a later edit resurrects it, which is the accepted semantics (§5.2).
  expect(
    reconcileElements([deleted], [element("rect", 5)], NOTHING_BEING_EDITED),
  ).toEqual([element("rect", 5)])
})

test("local-only elements survive a delta that never mentions them", () => {
  const reconciled = reconcileElements(
    [element("rect", 1, { index: "a0" }), element("note", 1, { index: "a2" })],
    [element("line", 1, { index: "a1" })],
    NOTHING_BEING_EDITED,
  )

  expect(idsOf(reconciled)).toEqual(["rect", "line", "note"])
})

test("the result is ordered by fractional index, not by arrival", () => {
  const reconciled = reconcileElements(
    [element("third", 1, { index: "a3" })],
    [
      element("first", 1, { index: "a1" }),
      element("second", 1, { index: "a2" }),
    ],
    NOTHING_BEING_EDITED,
  )

  expect(idsOf(reconciled)).toEqual(["first", "second", "third"])
})

test("elements sharing an index fall back to id order, so every peer agrees", () => {
  const reconciled = reconcileElements(
    [],
    [element("b", 1, { index: "a1" }), element("a", 1, { index: "a1" })],
    NOTHING_BEING_EDITED,
  )

  expect(idsOf(reconciled)).toEqual(["a", "b"])
})

test("a repeated id in one payload is applied once", () => {
  const reconciled = reconcileElements(
    [],
    [
      element("rect", 1, { text: "first" }),
      element("rect", 2, { text: "second" }),
    ],
    NOTHING_BEING_EDITED,
  )

  expect(reconciled).toEqual([element("rect", 1, { text: "first" })])
})

test("neither input array is mutated", () => {
  const local = [element("rect", 1, { index: "a2" })]
  const remote = [element("note", 1, { index: "a1" })]

  reconcileElements(local, remote, NOTHING_BEING_EDITED)

  expect(idsOf(local)).toEqual(["rect"])
  expect(idsOf(remote)).toEqual(["note"])
})

test("the scene version is the sum of element versions", () => {
  expect(getSceneVersion([])).toBe(0)
  expect(getSceneVersion([element("a", 3), element("b", 4)])).toBe(7)
})
