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
import {
  LINK_DEAD_CLOSE_CODE,
  ROOM_FULL_CLOSE_CODE,
  SCENE_UNREADABLE_CLOSE_CODE,
} from "./protocol"
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
  // Upstream's version bump, restated: it is what turns an image's storage
  // outcome into an ordinary delta the room picks up.
  newElementWith: (element: SceneElement, updates: Partial<SceneElement>) => ({
    ...element,
    ...updates,
    version: element.version + 1,
    versionNonce: element.versionNonce + 1,
  }),
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

/** One image element, in the shape the file half reads it. */
function image(
  id: string,
  version: number,
  fileId: string,
  status: "pending" | "saved" | "error" = "pending",
): SceneElement {
  return element(id, version, { type: "image", fileId, status })
}

type FakeFiles = Record<string, { id: string; dataURL: string }>

/**
 * A stand-in for Excalidraw: it holds a scene and its files, hands both back,
 * and — like the real `updateScene` — calls `onChange` synchronously when a
 * scene lands.
 */
function fakeExcalidraw(initial: SceneElement[] = [], files: FakeFiles = {}) {
  let scene = initial
  const api = {
    scene: () => scene,
    /** Excalidraw commits a local edit before it calls `onChange`. */
    setScene: (elements: SceneElement[]) => {
      scene = elements
    },
    files,
    onChange: (_elements: readonly SceneElement[]) => {},
    getSceneElementsIncludingDeleted: () => scene,
    getAppState: () => ({ collaborators: new Map() }),
    getFiles: () => api.files,
    addFiles: vi.fn((added: { id: string; dataURL: string }[]) => {
      for (const file of added) api.files[file.id] = file
    }),
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

function renderRoom(
  api: ReturnType<typeof fakeExcalidraw>,
  storedFileIds: readonly string[] = [],
) {
  let onChange:
    | ((
        elements: readonly SceneElement[],
        appState: unknown,
        files: FakeFiles,
      ) => void)
    | null = null
  let status: ConnectionStatus = "connecting"
  const onRoomFull = vi.fn()
  const onLinkDead = vi.fn()
  const onSceneUnreadable = vi.fn()
  function Harness({ token }: { token: string }) {
    const room = useRoom({
      token,
      name: "Ada",
      // The hook only ever reaches for the handful of methods above.
      excalidrawAPI: api as never,
      onRoomFull,
      onLinkDead,
      onSceneUnreadable,
      storedFileIds,
    })
    onChange = room.onChange as never
    status = room.connectionStatus
    return null
  }
  const { rerender } = render(<Harness token={TOKEN} />)
  // Wire the fake's updateScene back into the hook, the way Excalidraw does.
  api.onChange = (elements) => onChange?.(elements, null, api.files)
  const socket = sockets[0]
  act(() => socket.open())
  return {
    socket,
    /** Navigating from one share link to another, component still mounted. */
    retoken: (next: string) => act(() => rerender(<Harness token={next} />)),
    onRoomFull,
    onLinkDead,
    onSceneUnreadable,
    status: () => status,
    /** The socket the hook is on now — a reconnect makes a new one. */
    latest: () => sockets[sockets.length - 1],
    // The canvas commits the edit before it announces it — which is what
    // makes an edit survive a disconnect the hook heard nothing about.
    change: (elements: SceneElement[], files: FakeFiles = api.files) => {
      api.setScene(elements)
      act(() => onChange?.(elements, null, files))
    },
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

test("a damaged stored scene is reported, not retried", () => {
  const { socket, onSceneUnreadable } = renderRoom(fakeExcalidraw())
  act(() => socket.receive(joined()))

  act(() => socket.close(SCENE_UNREADABLE_CLOSE_CODE))
  waitOutBackoff()

  expect(onSceneUnreadable).toHaveBeenCalledTimes(1)
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

// --- Images (spec §2.4) -----------------------------------------------------
//
// Bytes never cross the socket. What these check is the seam either side of
// that rule: a local blob reaching the HTTP endpoint before its element
// claims to be saved, and a peer's saved element pulling the bytes back.

const PNG = "data:image/png;base64,QUJDRA=="

/** Replaces `fetch` with one canned answer and records what was asked for. */
function stubFetch(response: {
  ok: boolean
  /** Only read when `ok` is false; 4xx is a verdict, 5xx is a bad day. */
  status?: number
  body?: unknown
  /** Rejects instead of answering — the offline case. */
  offline?: boolean
}) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : null,
      })
      if (response.offline) return Promise.reject(new Error("offline"))
      return Promise.resolve({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 400),
        json: () => Promise.resolve(response.body),
      })
    }),
  )
  return calls
}

/** Lets the upload/fetch promises and the updateScene they cause settle. */
const settle = () => act(async () => {})

test("an image pasted here is stored over HTTP, then syncs as a saved delta", async () => {
  const calls = stubFetch({ ok: true })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  change([image("img", 1, "file-1")], {
    "file-1": { id: "file-1", dataURL: PNG },
  })
  await settle()

  expect(calls).toEqual([
    {
      url: "/api/rooms/share-token/files/file-1",
      method: "POST",
      body: { dataUrl: PNG },
    },
  ])
  // The blob went over HTTP; what reaches the room is the element, now saved.
  const broadcast = socket.scenesSent.at(-1) ?? []
  expect(broadcast.map((e) => [e.id, e.status])).toEqual([["img", "saved"]])
  expect(socket.sent.join("")).not.toContain(PNG)
})

test("a refused upload gets the errored-image placeholder", async () => {
  // 413 and 429 are the same answer to the canvas: this image will not reach
  // the room, so it wears excalidraw's own error state — which is also what
  // stops peers ever asking the endpoint for it (spec §5.4).
  const calls = stubFetch({ ok: false, status: 413 })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  change([image("img", 1, "file-1")], {
    "file-1": { id: "file-1", dataURL: PNG },
  })
  await settle()

  expect(calls).toHaveLength(1)
  expect(api.scene().map((e) => e.status)).toEqual(["error"])
})

test("the same blob is offered once, however often onChange fires", async () => {
  const calls = stubFetch({ ok: true })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))
  const files = { "file-1": { id: "file-1", dataURL: PNG } }

  change([image("img", 1, "file-1")], files)
  change([image("img", 1, "file-1")], files)
  await settle()

  expect(calls).toHaveLength(1)
})

test("images the page already loaded are never uploaded back", async () => {
  // `restore()` hands stored images back as `pending` forever, so without the
  // loader's id list every visitor would POST the whole drawing on arrival.
  const calls = stubFetch({ ok: true })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api, ["file-1"])
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  change([image("img", 1, "file-1")], {
    "file-1": { id: "file-1", dataURL: PNG },
  })
  await settle()

  expect(calls).toEqual([])
})

test("a peer's saved image is fetched and injected into the canvas", async () => {
  const calls = stubFetch({
    ok: true,
    body: {
      fileId: "file-1",
      mimeType: "image/png",
      dataUrl: PNG,
      created: 7,
    },
  })
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [image("img", 1, "file-1", "saved")] },
    }),
  )
  await settle()

  expect(calls).toEqual([
    { url: "/api/rooms/share-token/files/file-1", method: "GET", body: null },
  ])
  expect(api.addFiles).toHaveBeenCalledWith([
    { id: "file-1", mimeType: "image/png", dataURL: PNG, created: 7 },
  ])
})

test("a late joiner asks only for the bytes it is missing", async () => {
  const calls = stubFetch({ ok: true, body: null })
  const api = fakeExcalidraw([], { "file-1": { id: "file-1", dataURL: PNG } })
  const { socket } = renderRoom(api, ["file-1"])

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: {
        elements: [
          image("has", 1, "file-1", "saved"),
          image("needs", 1, "file-2", "saved"),
        ],
      },
    }),
  )
  await settle()

  expect(calls.map((call) => call.url)).toEqual([
    "/api/rooms/share-token/files/file-2",
  ])
})

test("a peer's pending or errored image is never fetched", async () => {
  // Pending means the row isn't written yet; errored means it never will be.
  const calls = stubFetch({ ok: true, body: null })
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: {
        elements: [
          image("a", 1, "file-1", "pending"),
          image("b", 1, "file-2", "error"),
        ],
      },
    }),
  )
  await settle()

  expect(calls).toEqual([])
})

test("a missed fetch retries itself, in a room that has gone quiet", async () => {
  // Nothing else would ask again: fetchMissing only runs when a frame
  // arrives, and a room where everyone stopped drawing sends none.
  vi.useFakeTimers()
  const calls = stubFetch({ ok: false })
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  act(() =>
    socket.receive({
      type: "SCENE_INIT",
      payload: { elements: [image("img", 1, "file-1", "saved")] },
    }),
  )
  await act(async () => {})
  expect(calls).toHaveLength(1)

  // No further frames — only the clock moves.
  await act(() => vi.advanceTimersByTimeAsync(2_000))
  expect(calls).toHaveLength(2)
  await act(() => vi.advanceTimersByTimeAsync(2_000))
  expect(calls).toHaveLength(3)

  // And then it gives up rather than hammering a 404 all session.
  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(calls).toHaveLength(3)
})

test("a blip leaves the image pending, and the next change retries it", async () => {
  // An unanswered request says nothing about the image, so it must not
  // condemn it — unlike the 413 and 429 the placeholder is meant for.
  const calls = stubFetch({ ok: true, offline: true })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))
  const files = { "file-1": { id: "file-1", dataURL: PNG } }

  change([image("img", 1, "file-1")], files)
  await settle()
  expect(api.scene().map((e) => e.status)).toEqual(["pending"])

  change([image("img", 2, "file-1")], files)
  await settle()

  expect(calls).toHaveLength(2)
})

test("an image that never gets an answer eventually gives up", async () => {
  const calls = stubFetch({ ok: true, offline: true })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))
  const files = { "file-1": { id: "file-1", dataURL: PNG } }

  for (let i = 0; i < 3; i++) {
    change([image("img", i + 1, "file-1")], files)
    await settle()
  }
  expect(calls).toHaveLength(3)
  expect(api.scene().map((e) => e.status)).toEqual(["error"])

  // And it stays given up on: further changes carry the errored element, so
  // nothing offers it again.
  change(api.scene(), files)
  await settle()
  expect(calls).toHaveLength(3)
})

test.each([
  ["a server error", 500],
  // The link was stopped or regenerated mid-session. That says nothing about
  // the picture, and the socket may well still be live — the eviction that
  // follows is a separate frame — so the room must not be told it is broken.
  ["an authorization refusal", 401],
])("%s is a blip, not a verdict on the image", async (_label, status) => {
  const calls = stubFetch({ ok: false, status })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  change([image("img", 1, "file-1")], {
    "file-1": { id: "file-1", dataURL: PNG },
  })
  await settle()

  expect(calls).toHaveLength(1)
  expect(api.scene().map((e) => e.status)).toEqual(["pending"])
})

test.each([
  ["too large", 413],
  ["too frequent", 429],
])("%s is a verdict, and errors the image at once", async (_label, status) => {
  const calls = stubFetch({ ok: false, status })
  const api = fakeExcalidraw()
  const { socket, change } = renderRoom(api)
  act(() => socket.receive({ type: "SCENE_INIT", payload: { elements: [] } }))

  change([image("img", 1, "file-1")], {
    "file-1": { id: "file-1", dataURL: PNG },
  })
  await settle()

  expect(calls).toHaveLength(1)
  expect(api.scene().map((e) => e.status)).toEqual(["error"])
})
