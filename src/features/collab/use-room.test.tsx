/**
 * The scene half of `useRoom`, driven against a fake socket and a fake
 * Excalidraw API. The reconcile rule itself is covered in `reconcile.test.ts`
 * and what-to-send in `scene-sync.test.ts`; what is checked here is the
 * plumbing between them and the socket — the ordering that decides whether a
 * remote edit is echoed back or a local one is dropped on the floor.
 */

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { RECONNECT_MAX_DELAY_MS } from "./backoff"
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from "./heartbeat"
import type { SceneElement, ServerMessage } from "./protocol"
import { LINK_DEAD_CLOSE_CODE, ROOM_FULL_CLOSE_CODE } from "./protocol"
import { reconcileElements } from "./reconcile"
import type { ConnectionStatus } from "./use-room"
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
  /**
   * Both halves of a real close: the state flips and the event fires. The
   * hook's reconnect hangs off that event, so a `close()` that only set the
   * state would let every retry test pass without a retry happening.
   */
  close(code = 1005) {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit("close", { code })
  }

  /**
   * Deliver a close event whatever the state already says. Stands for the
   * one thing a guarded `close()` cannot model: a real close event is
   * asynchronous, so it can arrive after the effect that opened the socket
   * has torn down and a replacement has already joined.
   */
  emitClose(code = 1006) {
    this.readyState = 3
    this.emit("close", { code })
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

  get typesSent() {
    return this.sent.map((raw) => JSON.parse(raw).type as string)
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
    /** What a local edit does before Excalidraw announces it. */
    setScene: (next: SceneElement[]) => {
      scene = next
    },
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
  let status: ConnectionStatus = "connecting"
  const onRoomFull = vi.fn()
  const onLinkDead = vi.fn()
  function Harness({ token }: { token: string }) {
    const room = useRoom({
      token,
      name: "Ada",
      // The hook only ever reaches for the handful of methods above.
      excalidrawAPI: api as never,
      onRoomFull,
      onLinkDead,
    })
    onChange = room.onChange as never
    status = room.connectionStatus
    return null
  }
  const { rerender } = render(<Harness token={TOKEN} />)
  // Wire the fake's updateScene back into the hook, the way Excalidraw does.
  api.onChange = (elements) => onChange?.(elements)
  const socket = sockets[0]
  act(() => socket.open())
  return {
    socket,
    /** Navigating from one share link to another, component still mounted. */
    retoken: (next: string) => act(() => rerender(<Harness token={next} />)),
    onRoomFull,
    onLinkDead,
    status: () => status,
    /** The socket the hook is on now — a reconnect makes a new one. */
    latest: () => sockets[sockets.length - 1],
    change: (elements: SceneElement[]) =>
      act(() => {
        // The canvas holds the edit before it announces it — which is what
        // makes an edit survive a disconnect the hook heard nothing about.
        api.setScene(elements)
        onChange?.(elements)
      }),
  }
}

/** Let every scheduled retry fire, whatever the jitter drew. */
const waitOutBackoff = () =>
  act(() => {
    vi.advanceTimersByTime(RECONNECT_MAX_DELAY_MS)
  })

beforeEach(() => {
  sockets = []
  vi.useFakeTimers()
  vi.stubGlobal("WebSocket", FakeSocket)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

// --- reconnect, heartbeat, and the closes that end the loop --------------

/** The one frame that says "the room accepted this socket". */
const joined = (): ServerMessage => ({
  type: "ROOM_JOINED",
  payload: { connectionId: "self", participants: [] },
})

test("a dropped socket is dialed again, and again", () => {
  const { socket, latest } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => socket.close(1006))
  waitOutBackoff()
  expect(sockets).toHaveLength(2)

  act(() => latest().close(1006))
  waitOutBackoff()
  expect(sockets).toHaveLength(3)
})

test("a disconnected tab says so, and stops once it is back in the room", () => {
  const { socket, status, latest } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))
  expect(status()).toBe("connected")

  act(() => socket.close(1006))
  expect(status()).toBe("reconnecting")

  waitOutBackoff()
  act(() => latest().open())
  // The socket is open but the room has not answered yet — still reconnecting.
  expect(status()).toBe("reconnecting")
  act(() => latest().receive(joined()))
  expect(status()).toBe("connected")
})

test("the first dial is not called a reconnection", () => {
  // The page is already showing its own loader; a second indicator saying
  // the same thing would read as a fault.
  const { status } = renderRoom(fakeExcalidraw())
  expect(status()).toBe("connecting")
})

test("work done while disconnected reaches the room on rejoin", () => {
  const api = fakeExcalidraw()
  const { socket, change, latest } = renderRoom(api)
  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("from-room", 1)] },
    }),
  )

  act(() => socket.close(1006))
  // The canvas is still live: this is the edit made during the outage.
  change([element("from-room", 1), element("drawn-offline", 1)])

  waitOutBackoff()
  const next = latest()
  act(() => next.open())
  act(() =>
    next.receive({
      type: "SCENE_INIT",
      payload: { elements: [element("from-room", 1)] },
    }),
  )

  expect(next.scenesSent.map((els) => els.map((e) => e.id))).toEqual([
    ["drawn-offline"],
  ])
})

test("a restarted server is re-told everything, not just the newest edits", () => {
  // The room flushes on an interval, so a crash loses the tail of a session.
  // The reconnect's catch-up is the only thing that puts it back, and it can
  // only do that if the previous socket's "the room has seen this" is gone.
  const api = fakeExcalidraw()
  const { socket, change, latest } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))
  change([element("drawn-before-crash", 1)])
  expect(socket.scenesSent.map((els) => els.map((e) => e.id))).toEqual([
    ["drawn-before-crash"],
  ])

  act(() => socket.close(1006))
  waitOutBackoff()
  const next = latest()
  act(() => next.open())
  // The restarted room came back without that element.
  act(() => next.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  expect(next.scenesSent.map((els) => els.map((e) => e.id))).toEqual([
    ["drawn-before-crash"],
  ])
})

test("a link that died is reported, not retried", () => {
  const { socket, onLinkDead } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => socket.close(LINK_DEAD_CLOSE_CODE))
  waitOutBackoff()

  expect(onLinkDead).toHaveBeenCalledTimes(1)
  expect(sockets).toHaveLength(1)
})

test("a full room is reported, not retried", () => {
  const { socket, onRoomFull } = renderRoom(fakeExcalidraw())

  act(() => socket.close(ROOM_FULL_CLOSE_CODE))
  waitOutBackoff()

  expect(onRoomFull).toHaveBeenCalledTimes(1)
  expect(sockets).toHaveLength(1)
})

test("a quiet session is kept warm by the heartbeat", () => {
  const { socket } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => {
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
  })
  expect(socket.typesSent).toContain("PING")

  // Answered, so the socket is left alone.
  act(() => socket.receive({ type: "PONG", payload: {} }))
  act(() => {
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS * 2)
  })
  expect(socket.readyState).not.toBe(3)
})

test("a socket that stops answering is dropped and dialed again", () => {
  // The half-open connection: still OPEN, delivering nothing. Without the
  // heartbeat nothing would ever notice, and the tab would sit there dead.
  const { socket } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => {
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS)
  })
  expect(socket.readyState).toBe(3)

  waitOutBackoff()
  expect(sockets).toHaveLength(2)
})

test("unmounting ends the retries", () => {
  const { socket } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  cleanup()
  act(() => socket.close(1006))
  waitOutBackoff()

  expect(sockets).toHaveLength(1)
})

test("a rejoin refused by the cap waits for a seat instead of losing the scene", () => {
  // The tab's old seat is still held server-side when it comes back. Sending
  // it to the "drawing full" page would unmount the canvas and take
  // everything it drew during the outage with it.
  const { socket, onRoomFull, status, latest } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => socket.close(ROOM_FULL_CLOSE_CODE))

  expect(onRoomFull).not.toHaveBeenCalled()
  expect(status()).toBe("reconnecting")
  waitOutBackoff()
  expect(sockets).toHaveLength(2)

  // And it gets in once the stale seat is reclaimed.
  act(() => latest().open())
  act(() => latest().receive(joined()))
  expect(status()).toBe("connected")
})

test("a late close from a socket the hook has moved on from leaves the live one alone", () => {
  // Navigating from one share link to another keeps this component mounted.
  // The old socket's close is asynchronous and can land after the new one
  // has joined; resetting there would wipe the live connection's broadcaster
  // and quietly stop every local edit from going out.
  const api = fakeExcalidraw()
  const { socket, change, latest, retoken } = renderRoom(api)
  act(() => socket.receive(joined()))

  retoken("another-share-token")
  const next = latest()
  expect(next).not.toBe(socket)
  act(() => next.open())
  act(() => next.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  // The abandoned socket's close arrives now, out of order.
  act(() => socket.emitClose(1006))

  change([element("drawn-after", 1)])
  expect(next.scenesSent.map((els) => els.map((e) => e.id))).toEqual([
    ["drawn-after"],
  ])
})
