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
  function Harness() {
    const room = useRoom({
      token: TOKEN,
      name: "Ada",
      // The hook only ever reaches for the handful of methods above.
      excalidrawAPI: api as never,
      // The participant cap is #125's; nothing here trips it.
      onRoomFull: () => {},
      storedFileIds,
    })
    onChange = room.onChange as never
    return null
  }
  render(<Harness />)
  // Wire the fake's updateScene back into the hook, the way Excalidraw does.
  api.onChange = (elements) => onChange?.(elements, null, api.files)
  const socket = sockets[0]
  act(() => socket.open())
  return {
    socket,
    change: (elements: SceneElement[], files: FakeFiles = api.files) => {
      api.setScene(elements)
      act(() => onChange?.(elements, null, files))
    },
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

// --- Images (spec §2.4) -----------------------------------------------------
//
// Bytes never cross the socket. What these check is the seam either side of
// that rule: a local blob reaching the HTTP endpoint before its element
// claims to be saved, and a peer's saved element pulling the bytes back.

const PNG = "data:image/png;base64,QUJDRA=="

/** Replaces `fetch` with one canned answer and records what was asked for. */
function stubFetch(response: { ok: boolean; body?: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : null,
      })
      return Promise.resolve({
        ok: response.ok,
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
  const calls = stubFetch({ ok: false })
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

test("a missed fetch is retried, but not for the whole session", async () => {
  const calls = stubFetch({ ok: false })
  const api = fakeExcalidraw()
  const { socket } = renderRoom(api)

  for (let i = 0; i < 6; i++) {
    act(() =>
      socket.receive({
        type: "SCENE_UPDATE",
        payload: { elements: [image("img", i + 1, "file-1", "saved")] },
      }),
    )
    await settle()
  }

  expect(calls).toHaveLength(3)
})
