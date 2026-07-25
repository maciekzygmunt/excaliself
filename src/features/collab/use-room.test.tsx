/**
 * The scene half of `useRoom`, driven against a fake socket and a fake
 * Excalidraw API. The reconcile rule itself is covered in `reconcile.test.ts`
 * and what-to-send in `scene-sync.test.ts`; what is checked here is the
 * plumbing between them and the socket — the ordering that decides whether a
 * remote edit is echoed back or a local one is dropped on the floor.
 */

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { SceneElement, ServerMessage } from "./protocol"
import { reconcileElements } from "./reconcile"
import { useRoom } from "./use-room"

// `@excalidraw/excalidraw` can't be loaded outside the browser build — the
// same thing that forced the server-side port of the merge rule (ADR 0001).
// The mock hands `reconcileElements` to that port, which is the identical
// rule, so what these tests lose is only the type-branding upstream adds.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  restoreElements: (elements: SceneElement[]) => elements,
  reconcileElements: (
    local: SceneElement[],
    remote: SceneElement[],
    appState: Record<string, never>,
  ) => reconcileElements(local, remote, appState),
}))

const TOKEN = "share-token"

let sockets: FakeSocket[] = []

/** Enough of a WebSocket for the hook: state, sends, and inbound frames. */
class FakeSocket {
  static readonly OPEN = 1
  readonly sent: string[] = []
  readyState = 0
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(readonly url: string) {
    sockets.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
  }

  private emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event)
  }
  open() {
    this.readyState = FakeSocket.OPEN
    this.emit("open", {})
  }
  receive(message: ServerMessage) {
    this.emit("message", { data: JSON.stringify(message) })
  }

  /** Every SCENE_UPDATE this tab has put on the wire, payload only. */
  get scenesSent() {
    return this.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.type === "SCENE_UPDATE")
      .map((message) => message.payload.elements as SceneElement[])
  }
}

function element(
  id: string,
  version: number,
  extra: Partial<SceneElement> = {},
): SceneElement {
  return {
    id,
    type: "rectangle",
    version,
    versionNonce: 1,
    index: "a0",
    isDeleted: false,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  }
}

/**
 * A stand-in for Excalidraw: it holds a scene, hands it back, and — like the
 * real `updateScene` — calls `onChange` synchronously when the scene lands.
 */
function fakeExcalidraw(initial: SceneElement[] = []) {
  let scene = initial
  const api = {
    scene: () => scene,
    onChange: (_elements: readonly SceneElement[]) => {},
    getSceneElementsIncludingDeleted: () => scene,
    getAppState: () => ({ collaborators: new Map() }),
    updateScene: vi.fn(
      (data: { elements?: SceneElement[]; captureUpdate?: string }) => {
        if (!data.elements) return
        scene = data.elements
        api.onChange(scene)
      },
    ),
    // Follow mode subscribes on mount (spec §1.3). Nothing here drives it,
    // but the real API always has it, so the stand-in must too.
    onUserFollow: () => () => {},
  }
  return api
}

function renderRoom(api: ReturnType<typeof fakeExcalidraw>) {
  let onChange: ((elements: readonly SceneElement[]) => void) | null = null
  function Harness() {
    const room = useRoom({
      token: TOKEN,
      name: "Ada",
      // The hook only ever reaches for the handful of methods above.
      excalidrawAPI: api as never,
      // The participant cap is #125's; nothing here trips it.
      onRoomFull: () => {},
    })
    onChange = room.onChange as never
    return null
  }
  render(<Harness />)
  // Wire the fake's updateScene back into the hook, the way Excalidraw does.
  api.onChange = (elements) => onChange?.(elements)
  const socket = sockets[0]
  act(() => socket.open())
  return {
    socket,
    change: (elements: SceneElement[]) => act(() => onChange?.(elements)),
  }
}

beforeEach(() => {
  sockets = []
  vi.stubGlobal("WebSocket", FakeSocket)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test("SCENE_INIT is applied to the canvas, and never re-enters local undo", () => {
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("rect", 3)] },
    }),
  )

  const [update] = api.updateScene.mock.calls.at(-1) ?? []
  expect(update?.elements?.map((e: SceneElement) => e.id)).toEqual(["rect"])
  expect(update?.captureUpdate).toBe("never")
})

test("what the room sent is not echoed straight back at it", () => {
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("rect", 3)] },
    }),
  )

  // updateScene re-triggers onChange synchronously; nothing may go out from it.
  expect(socket.scenesSent).toEqual([])
})

test("a local edit is broadcast, and only the element that changed", () => {
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("a", 1), element("b", 1)] },
    }),
  )

  change([element("a", 2), element("b", 1)])

  expect(socket.scenesSent.map((els) => els.map((e) => e.id))).toEqual([["a"]])
})

test("an edit made before SCENE_INIT lands still reaches the room", () => {
  // The socket opens before the room's scene read finishes, so this tab can
  // be drawn on in between. Those elements must not be silently swallowed.
  const api = fakeExcalidraw([element("drawn-early", 1, { index: "a2" })])
  const { socket, change } = renderRoom(api)

  change([element("drawn-early", 1, { index: "a2" })])
  expect(socket.scenesSent).toEqual([])

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("from-room", 5, { index: "a1" })] },
    }),
  )

  // The catch-up carries what the room had never seen — and nothing else.
  expect(socket.scenesSent.map((els) => els.map((e) => e.id))).toEqual([
    ["drawn-early"],
  ])
})

test("nothing is sent while the socket is closed", () => {
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))
  socket.readyState = 3

  change([element("a", 1)])

  expect(socket.scenesSent).toEqual([])
})
