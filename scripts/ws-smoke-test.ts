/**
 * Websocket smoke test for the collab room (canvas sharing spec §6, rollout
 * note 4). Drives two real sockets against a running instance and checks the
 * whole transport: upgrade auth, presence on join and leave, and cursor
 * relay.
 *
 * Run it after any change to the nitro/TanStack Start versions, in BOTH
 * `pnpm dev` and the built container — the pinned nitro beta is the reason
 * this script exists. See docs/collab-websocket-smoke-test.md.
 *
 *   pnpm smoke:ws                       # mints a token from DATABASE_URL
 *   pnpm smoke:ws --token <share-token> # uses a link from the Share dialog
 *   pnpm smoke:ws --url http://localhost:3000 --token <share-token>
 */

import { randomBytes, randomUUID } from "node:crypto"
import { config as loadEnv } from "dotenv"
import { Client } from "pg"
import {
  FRAME_TOO_LARGE_CLOSE_CODE,
  MAX_FRAME_BYTES,
} from "../src/features/collab/frame-cap"
import {
  LINK_DEAD_CLOSE_CODE,
  ROOM_FULL_CLOSE_CODE,
} from "../src/features/collab/protocol"
import { MAX_ROOM_PARTICIPANTS } from "../src/features/collab/room-session"

loadEnv()

type Args = { url: string; token?: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { url: process.env.SMOKE_URL ?? "http://localhost:3000" }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === "--url" && value) args.url = value
    else if (flag === "--token" && value) args.token = value
    else throw new Error(`Unknown argument: ${flag}`)
  }
  return args
}

const socketUrl = (httpUrl: string, token: string) => {
  const url = new URL(httpUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `/ws/rooms/${encodeURIComponent(token)}`
  return url.toString()
}

// --- a tiny socket harness --------------------------------------------

type Frame = { type: string; payload: Record<string, unknown> }

class Peer {
  readonly frames: Frame[] = []
  private socket: WebSocket
  /**
   * Subscribed at construction, not when someone asks: the server can close a
   * socket the instant it opens (the participant cap does exactly that), and a
   * listener added after `connect()` resolves would miss it.
   */
  private readonly closeCode: Promise<number>

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.addEventListener("message", (event) => {
      this.frames.push(JSON.parse(String(event.data)))
    })
    this.closeCode = new Promise((resolve) => {
      socket.addEventListener("close", (event) => {
        resolve(event.code)
      })
    })
  }

  static connect(url: string, timeoutMs = 5000): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      const peer = new Peer(socket)
      const timer = setTimeout(
        () => reject(new Error("timed out waiting for open")),
        timeoutMs,
      )
      socket.addEventListener("open", () => {
        clearTimeout(timer)
        resolve(peer)
      })
      socket.addEventListener("error", () => {
        clearTimeout(timer)
        reject(new Error("connection refused"))
      })
    })
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message))
  }

  close() {
    this.socket.close()
  }

  /** The code the server closed with, for the closes that mean something. */
  closedWith(timeoutMs = 5000): Promise<number> {
    return Promise.race([
      this.closeCode,
      new Promise<number>((_, reject) =>
        setTimeout(
          () => reject(new Error("timed out waiting for close")),
          timeoutMs,
        ),
      ),
    ])
  }

  /** Where the frame log stands now, to pass as `since` on a later expect. */
  mark() {
    return this.frames.length
  }

  /** Waits for the next frame of `type` that satisfies `matches`. */
  async expect(
    type: string,
    matches: (frame: Frame) => boolean = () => true,
    { timeoutMs = 5000, since = 0 } = {},
  ): Promise<Frame> {
    const deadline = Date.now() + timeoutMs
    let seen = since
    while (Date.now() < deadline) {
      for (; seen < this.frames.length; seen++) {
        const frame = this.frames[seen]
        if (frame.type === type && matches(frame)) return frame
      }
      await new Promise((r) => setTimeout(r, 25))
    }
    throw new Error(
      `timed out waiting for ${type}; saw ${JSON.stringify(this.frames.map((f) => f.type))}`,
    )
  }
}

const participantsOf = (frame: Frame) =>
  (frame.payload.participants ?? []) as { connectionId: string; name: string }[]

/**
 * Waits for a peer's *latest* roster to settle at `size`. `expect` scans from
 * the first frame, which can't tell "the room grew to 24 on the way up" from
 * "the room came back down to 24" — and the difference is what says the
 * server has finished processing a departure.
 */
async function roomSettlesAt(peer: Peer, size: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const latest = [...peer.frames]
      .reverse()
      .find((f) => f.type === "PARTICIPANTS" || f.type === "ROOM_JOINED")
    if (latest && participantsOf(latest).length === size) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`the room never settled at ${size} participants`)
}

type WireElement = {
  id: string
  version: number
  versionNonce: number
  [key: string]: unknown
}

const elementsOf = (frame: Frame) =>
  (frame.payload.elements ?? []) as WireElement[]

/** A shape no other run could have drawn, so checks can't read each other's. */
const scribble = (version: number, versionNonce = 1): WireElement => ({
  id: `smoke-${randomBytes(6).toString("hex")}`,
  version,
  versionNonce,
  index: "a1",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
})

const findElement = (frame: Frame, id: string) =>
  elementsOf(frame).find((element) => element.id === id)

// --- the checks --------------------------------------------------------

const checks: {
  name: string
  run: (token: string, url: string) => Promise<void>
}[] = [
  {
    // Spec §5.3. The upgrade completes and the close code carries the answer:
    // a refused handshake would reach the browser as an opaque 1006, which a
    // client reconnecting through an outage cannot tell from a server that is
    // merely down — and would retry against forever.
    name: "a bogus token is closed with the dead-link code, not left to retry",
    run: async (_token, url) => {
      const dead = randomBytes(32).toString("hex")
      const refused = await Peer.connect(socketUrl(url, dead))
      const code = await refused.closedWith()
      if (code !== LINK_DEAD_CLOSE_CODE)
        throw new Error(
          `expected close code ${LINK_DEAD_CLOSE_CODE}, got ${code}`,
        )
      if (refused.frames.length > 0)
        throw new Error("a refused socket was told something about a room")
    },
  },
  {
    // Spec §5.3, rollout note 2 — the thing that keeps a quiet session alive
    // past a proxy's 60 s idle timeout.
    name: "a heartbeat is answered",
    run: async (token, url) => {
      const peer = await Peer.connect(socketUrl(url, token))
      await peer.expect("ROOM_JOINED")
      peer.send({ type: "PING", payload: {} })
      await peer.expect("PONG")
      peer.close()
    },
  },
  {
    // Spec §5.4. No error channel: the close is all the client gets, and the
    // reconnect's SCENE_INIT is what puts the session back together.
    name: "a frame past the cap closes the socket with 1009",
    run: async (token, url) => {
      const peer = await Peer.connect(socketUrl(url, token))
      await peer.expect("ROOM_JOINED")
      // Comfortably over 4 MB, and shaped like something the parser would
      // otherwise accept — so what refuses it is the cap and nothing else.
      const oversized = { ...scribble(1), text: "x".repeat(MAX_FRAME_BYTES) }
      peer.send({ type: "SCENE_UPDATE", payload: { elements: [oversized] } })
      const code = await peer.closedWith()
      if (code !== FRAME_TOO_LARGE_CLOSE_CODE)
        throw new Error(
          `expected close code ${FRAME_TOO_LARGE_CLOSE_CODE}, got ${code}`,
        )
    },
  },
  {
    name: "a valid token joins the room and learns its own connection id",
    run: async (token, url) => {
      const peer = await Peer.connect(socketUrl(url, token))
      const joined = await peer.expect("ROOM_JOINED")
      if (typeof joined.payload.connectionId !== "string")
        throw new Error("ROOM_JOINED carried no connection id")
      if (participantsOf(joined).length !== 1)
        throw new Error("a fresh room should hold exactly the joiner")
      peer.close()
    },
  },
  {
    name: "two peers see each other, exchange cursors, and notice a departure",
    run: async (token, url) => {
      const a = await Peer.connect(socketUrl(url, token))
      const aJoined = await a.expect("ROOM_JOINED")
      const b = await Peer.connect(socketUrl(url, token))
      const bJoined = await b.expect("ROOM_JOINED")
      const bId = bJoined.payload.connectionId as string

      await a.expect("PARTICIPANTS", (f) => participantsOf(f).length === 2)

      b.send({ type: "JOIN", payload: { name: "Smoke Tester" } })
      await a.expect("PARTICIPANTS", (f) =>
        participantsOf(f).some((p) => p.name === "Smoke Tester"),
      )

      b.send({
        type: "MOUSE_LOCATION",
        payload: {
          pointer: { x: 42, y: 7, tool: "pointer" },
          button: "up",
          selectedElementIds: {},
        },
      })
      const cursor = await a.expect(
        "MOUSE_LOCATION",
        (f) => f.payload.connectionId === bId,
      )
      const pointer = cursor.payload.pointer as { x: number; y: number }
      if (pointer.x !== 42 || pointer.y !== 7)
        throw new Error("cursor arrived with the wrong coordinates")
      if (b.frames.some((f) => f.type === "MOUSE_LOCATION"))
        throw new Error("a peer received the echo of its own cursor")

      b.close()
      await a.expect("PARTICIPANTS", (f) => participantsOf(f).length === 1)
      if (aJoined.payload.connectionId === bId)
        throw new Error("two sockets shared one connection id")
      a.close()
    },
  },
  {
    name: "a follower gets the viewport, and only while it is following",
    run: async (token, url) => {
      const watched = await Peer.connect(socketUrl(url, token))
      const watchedId = (await watched.expect("ROOM_JOINED")).payload
        .connectionId as string
      const follower = await Peer.connect(socketUrl(url, token))
      await follower.expect("ROOM_JOINED")
      const bystander = await Peer.connect(socketUrl(url, token))
      await bystander.expect("ROOM_JOINED")

      // Nobody is following yet, so a viewport must reach nobody.
      watched.send({
        type: "USER_VISIBLE_SCENE_BOUNDS",
        payload: { bounds: [0, 0, 1, 1] },
      })

      follower.send({
        type: "USER_FOLLOW",
        payload: { followedConnectionId: watchedId },
      })
      await watched.expect(
        "FOLLOWED_BY",
        (f) => (f.payload.connectionIds as string[]).length === 1,
      )

      watched.send({
        type: "USER_VISIBLE_SCENE_BOUNDS",
        payload: { bounds: [10, 20, 110, 70] },
      })
      const relayed = await follower.expect(
        "USER_VISIBLE_SCENE_BOUNDS",
        (f) => f.payload.connectionId === watchedId,
      )
      if ((relayed.payload.bounds as number[])[0] !== 10)
        throw new Error("the viewport arrived with the wrong bounds")
      if (
        follower.frames.filter((f) => f.type === "USER_VISIBLE_SCENE_BOUNDS")
          .length > 1
      )
        throw new Error("a viewport was relayed before anyone was following")
      if (bystander.frames.some((f) => f.type === "USER_VISIBLE_SCENE_BOUNDS"))
        throw new Error("a viewport reached someone who was not following")

      follower.send({
        type: "USER_FOLLOW",
        payload: { followedConnectionId: null },
      })
      await watched.expect(
        "FOLLOWED_BY",
        (f) => (f.payload.connectionIds as string[]).length === 0,
      )

      watched.send({
        type: "USER_VISIBLE_SCENE_BOUNDS",
        payload: { bounds: [1, 1, 2, 2] },
      })
      await new Promise((r) => setTimeout(r, 250))
      if (
        follower.frames.filter((f) => f.type === "USER_VISIBLE_SCENE_BOUNDS")
          .length > 1
      )
        throw new Error("viewports kept arriving after the follow was stopped")

      for (const peer of [watched, follower, bystander]) peer.close()
    },
  },
  {
    // Spec §4.5. The upgrade still succeeds — the cap is enforced on the
    // open, because only a close code reaches the page as something it can
    // turn into the "this drawing is full" state.
    name: "the socket past the participant cap is closed, and its slot reopens",
    run: async (token, url) => {
      const seated = await Promise.all(
        Array.from({ length: MAX_ROOM_PARTICIPANTS }, () =>
          Peer.connect(socketUrl(url, token)),
        ),
      )
      try {
        await Promise.all(seated.map((peer) => peer.expect("ROOM_JOINED")))

        const refused = await Peer.connect(socketUrl(url, token))
        const code = await refused.closedWith()
        if (code !== ROOM_FULL_CLOSE_CODE)
          throw new Error(
            `expected close code ${ROOM_FULL_CLOSE_CODE}, got ${code}`,
          )
        if (refused.frames.length > 0)
          throw new Error("a refused socket was told about the room")

        // The departure and the replacement's handshake travel on different
        // connections, so wait until a peer that stayed can see the slot is
        // free — otherwise the replacement can race the leave and be refused.
        seated.pop()?.close()
        await roomSettlesAt(seated[0], MAX_ROOM_PARTICIPANTS - 1)

        const admitted = await Peer.connect(socketUrl(url, token))
        await admitted.expect("ROOM_JOINED")
        admitted.close()
      } finally {
        for (const peer of seated) peer.close()
      }
    },
  },
  {
    name: "a joiner is handed the room's scene",
    run: async (token, url) => {
      const peer = await Peer.connect(socketUrl(url, token))
      await peer.expect("SCENE_INIT")
      peer.close()
    },
  },
  {
    name: "an edit by one peer lands in the other's scene, and in a late joiner's",
    run: async (token, url) => {
      const a = await Peer.connect(socketUrl(url, token))
      await a.expect("SCENE_INIT")
      const b = await Peer.connect(socketUrl(url, token))
      await b.expect("SCENE_INIT")

      const drawn = scribble(1)
      a.send({ type: "SCENE_UPDATE", payload: { elements: [drawn] } })
      await b.expect("SCENE_UPDATE", (f) => Boolean(findElement(f, drawn.id)))
      if (a.frames.some((f) => f.type === "SCENE_UPDATE"))
        throw new Error("a peer received the echo of its own edit")

      // The room, not the database, is what a late joiner is initialized from.
      const c = await Peer.connect(socketUrl(url, token))
      await c.expect("SCENE_INIT", (f) => Boolean(findElement(f, drawn.id)))

      a.close()
      b.close()
      c.close()
    },
  },
  {
    name: "a stale edit is refused, and its sender is handed the winner",
    run: async (token, url) => {
      const a = await Peer.connect(socketUrl(url, token))
      await a.expect("SCENE_INIT")
      const b = await Peer.connect(socketUrl(url, token))
      await b.expect("SCENE_INIT")

      const winner = scribble(9)
      a.send({ type: "SCENE_UPDATE", payload: { elements: [winner] } })
      await b.expect("SCENE_UPDATE", (f) => Boolean(findElement(f, winner.id)))

      const before = b.mark()
      b.send({
        type: "SCENE_UPDATE",
        payload: { elements: [{ ...winner, version: 2 }] },
      })
      // The room answers its own sender — the correction that lets a peer
      // whose edit lost converge instead of sitting on a version nobody has.
      const correction = await b.expect(
        "SCENE_UPDATE",
        (f) => findElement(f, winner.id) !== undefined,
        { since: before },
      )
      if (findElement(correction, winner.id)?.version !== 9)
        throw new Error("the room let a stale version through")

      a.close()
      b.close()
    },
  },
]

// --- token provisioning ------------------------------------------------

async function mintToken(): Promise<{
  token: string
  cleanup: () => Promise<void>
}> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString)
    throw new Error(
      "pass --token <share-token>, or set DATABASE_URL so one can be minted",
    )

  const client = new Client({ connectionString })
  await client.connect()
  const { rows } = await client.query<{ id: string }>(
    `select id from drawings where "deletedAt" is null order by "updatedAt" desc limit 1`,
  )
  if (rows.length === 0)
    throw new Error("no live drawing to share — create one in the app first")

  const token = randomBytes(32).toString("hex")
  await client.query(
    `insert into shares (id, token, "drawingId", audience, "createdAt")
     values ($1, $2, $3, 'anyone', now())
     on conflict ("drawingId") do update set token = excluded.token, audience = 'anyone'`,
    [randomUUID(), token, rows[0].id],
  )
  console.log(`  minted an anyone-audience share for drawing ${rows[0].id}`)

  return {
    token,
    cleanup: async () => {
      await client.query(`delete from shares where token = $1`, [token])
      await client.end()
    },
  }
}

// --- runner ------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(`ws smoke test against ${args.url}`)

  const minted = args.token ? null : await mintToken()
  const token = args.token ?? minted?.token
  if (!token) throw new Error("no share token")

  let failed = 0
  try {
    for (const check of checks) {
      try {
        await check.run(token, args.url)
        console.log(`  ✓ ${check.name}`)
      } catch (error) {
        failed++
        console.error(`  ✗ ${check.name}\n      ${(error as Error).message}`)
      }
    }
  } finally {
    await minted?.cleanup()
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`)
    process.exit(1)
  }
  console.log("\nall checks passed")
  process.exit(0)
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
