import { expect, test } from "vitest"
import type { SceneElement } from "./protocol"
import {
  createSceneBroadcaster,
  DELETED_ELEMENT_TIMEOUT_MS,
  splitSceneFrames,
} from "./scene-sync"

const NOW = 1_700_000_000_000

function element(
  id: string,
  version: number,
  extra: Partial<SceneElement> = {},
): SceneElement {
  return { id, version, versionNonce: 1, index: "a0", ...extra }
}

const idsOf = (elements: SceneElement[] | null) =>
  elements?.map((e) => e.id) ?? null

test("the first change sends everything on the canvas", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)

  expect(idsOf(broadcaster.delta([element("a", 1), element("b", 1)]))).toEqual([
    "a",
    "b",
  ])
})

test("only the elements that actually moved go out again", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  broadcaster.delta([element("a", 1), element("b", 1)])

  expect(idsOf(broadcaster.delta([element("a", 2), element("b", 1)]))).toEqual([
    "a",
  ])
})

test("a change that leaves the scene version alone sends nothing", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const scene = [element("a", 1)]
  broadcaster.delta(scene)

  // Panning, selecting and hovering all re-fire onChange with the same scene.
  expect(broadcaster.delta(scene)).toBeNull()
  expect(broadcaster.delta(scene)).toBeNull()
})

test("what came in from the room is not echoed back out", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const remote = [element("a", 5)]

  broadcaster.received(remote, remote)

  // The updateScene that applies it re-triggers onChange straight away.
  expect(broadcaster.delta(remote)).toBeNull()
})

test("a local edit on top of a received element sends only that element", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const reconciled = [element("a", 5), element("b", 2)]
  broadcaster.received(reconciled, reconciled)

  expect(idsOf(broadcaster.delta([element("a", 6), element("b", 2)]))).toEqual([
    "a",
  ])
})

test("the full sync repeats everything, including what has already been sent", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const scene = [element("a", 1), element("b", 1)]
  broadcaster.delta(scene)

  expect(idsOf(broadcaster.full(scene))).toEqual(["a", "b"])
})

test("the catch-up after SCENE_INIT carries only what the room did not send", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const fromRoom = [element("shared", 3)]
  const reconciled = [element("shared", 3), element("mine-only", 1)]

  broadcaster.received(fromRoom, reconciled)

  expect(idsOf(broadcaster.catchUp(reconciled))).toEqual(["mine-only"])
})

test("a full sync does not re-open the gate on a scene already broadcast", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const scene = [element("a", 4)]
  broadcaster.delta(scene)
  broadcaster.full(scene)

  expect(broadcaster.delta(scene)).toBeNull()
})

test("a deletion syncs, and stops syncing a day later", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)
  const fresh = element("a", 2, { isDeleted: true, updated: NOW - 1000 })
  const ancient = element("b", 2, {
    isDeleted: true,
    updated: NOW - DELETED_ELEMENT_TIMEOUT_MS - 1,
  })

  expect(idsOf(broadcaster.full([fresh, ancient]))).toEqual(["a"])
})

test("a deletion with no timestamp keeps syncing rather than being lost", () => {
  const broadcaster = createSceneBroadcaster(() => NOW)

  expect(
    idsOf(broadcaster.full([element("a", 2, { isDeleted: true })])),
  ).toEqual(["a"])
})

test("an ordinary delta goes out as one frame, unmeasured", () => {
  const elements = [element("a", 1), element("b", 1)]
  expect(splitSceneFrames(elements)).toEqual([elements])
  expect(splitSceneFrames([])).toEqual([])
})

test("a scene too big for one frame is cut into several", () => {
  // Each element carries a kilobyte of payload; the cap here fits a handful.
  const fat = (id: string) =>
    element(id, 1, { text: "x".repeat(1_000) }) as SceneElement
  const elements = ["a", "b", "c", "d", "e"].map(fat)

  const frames = splitSceneFrames(elements, 2_500)

  expect(frames.length).toBeGreaterThan(1)
  // Nothing is lost and nothing is duplicated in the cutting.
  expect(frames.flat().map((el) => el.id)).toEqual(["a", "b", "c", "d", "e"])
  for (const frame of frames)
    expect(JSON.stringify(frame).length).toBeLessThan(2_500)
})

test("an element too big to ever fit is dropped rather than looping the socket", () => {
  // Sending it would close the socket with 1009, and the reconnect would send
  // it again — the one failure mode the split exists to prevent.
  const elements = [
    element("ok", 1) as SceneElement,
    element("huge", 1, { text: "x".repeat(5_000) }) as SceneElement,
  ]

  expect(splitSceneFrames(elements, 2_000)).toEqual([[elements[0]]])
})
