/**
 * The Room: who is connected to a shared drawing right now, and the
 * authoritative scene they are all editing (canvas sharing spec §2.1–§2.3).
 *
 * Deliberately free of crossws and nitro imports — it talks to a {@link RoomPeer}
 * interface the websocket route adapts a real peer to, and reads the stored
 * scene through an injected {@link SceneLoader}. That keeps the whole
 * join/reconcile/relay/leave cycle drivable from unit tests, which is the only
 * place multi-peer behavior can be checked without standing up a server.
 *
 * The server is the authority, not a relay: every incoming delta is merged
 * into the Room's own copy first, and what goes back out is the Room's ruling
 * rather than the sender's claim. That scene is also the only thing being
 * written to the drawing while a share is live (spec §2.3): flushes go out on
 * a trailing throttle while dirty, when the last participant leaves, and on
 * SIGTERM.
 */

import { guestNameForConnection, pickParticipantColor } from "./identity"
import type { Participant, SceneElement, ServerMessage } from "./protocol"
import {
  LINK_DEAD_CLOSE_CODE,
  LINK_DEAD_CLOSE_REASON,
  parseClientMessage,
  ROOM_TOPIC,
} from "./protocol"
import { reconcileElements } from "./reconcile"
import type { StoredScene } from "./scene-store"

/** The slice of a crossws `Peer` the room logic uses. */
export interface RoomPeer {
  /** crossws mints a random uuid per socket — the connection id of spec §4.4. */
  readonly id: string
  send(data: ServerMessage): void
  /** Fans out to the rest of the namespace; never echoes to the sender. */
  publish(topic: string, data: ServerMessage): void
  subscribe(topic: string): void
  /**
   * Hangs up on this socket. The code is the whole message — a browser hands
   * the page nothing else it can act on — so the two the client reads
   * (`LINK_DEAD_CLOSE_CODE`, `ROOM_FULL_CLOSE_CODE`) are the vocabulary.
   */
  close(code: number, reason: string): void
}

/**
 * What the upgrade hook established about the socket. `userId` is null for
 * guests — the one thing that decides whether a name from the wire is
 * believed.
 */
export type ParticipantIdentity = {
  userId: string | null
  displayName: string | null
}

/** Reads a drawing's stored scene when its Room first spins up. */
export type SceneLoader = (roomId: string) => Promise<StoredScene>

/** Writes a Room's authoritative scene back to its drawing (spec §2.3). */
export type SceneSaver = (
  roomId: string,
  elements: SceneElement[],
) => Promise<void>

/**
 * How long a Room sits on unsaved edits before writing them (spec §2.3).
 * Trailing, so a burst of strokes costs one write rather than one per stroke,
 * and a hard crash loses at most this much from the database — reconnecting
 * clients reconcile and re-broadcast the rest.
 */
export const ROOM_FLUSH_INTERVAL_MS = 15_000

/** One connected socket and what the Room knows about it. */
export type Seat = {
  participant: Participant
  peer: RoomPeer
  /** Null for a guest. Kept off `participant`, which goes on the wire. */
  userId: string | null
  /** Last frame time, for the ghost sweep. */
  lastSeenAt: number
}

export type Room = {
  /** The drawing this Room belongs to — its key in the registry. */
  id: string
  /** Keyed by connection id. */
  seats: Map<string, Seat>
  /** Follower connection id → the connection id it is trailing (spec §1.3). */
  follows: Map<string, string>
  /** Resolves when the stored scene has been read (or failed to read). */
  loaded: Promise<void>
  /**
   * False when the stored scene could not be read. Such a Room still relays
   * cursors and edits, but it must never write: its `elements` describe a
   * drawing it never saw, and flushing them would erase the real one.
   */
  persistable: boolean
  /** The authoritative scene, in fractional-index order. */
  elements: SceneElement[]
  /** Cached at load time for the live badge (spec §1.5). */
  ownerId: string | null
  /** Set when a merge changed the scene, cleared once it has been written. */
  dirty: boolean
  /** The armed trailing flush, if any. */
  flushTimer: ReturnType<typeof setTimeout> | null
  /**
   * The write in flight, so overlapping triggers (the throttle firing as the
   * last participant leaves, say) queue instead of racing each other into the
   * same row.
   */
  flushing: Promise<void>
}

/**
 * Live rooms, keyed by drawing id — one Room per Drawing. In-memory per
 * process, so the app stays single-replica (spec §2.3).
 */
export type RoomRegistry = {
  rooms: Map<string, Room>
  loadScene: SceneLoader
  saveScene: SceneSaver
  /** Injected so the ghost sweep of spec §5.3 is drivable from a test. */
  now: () => number
}

export function createRoomRegistry(
  loadScene: SceneLoader,
  saveScene: SceneSaver,
  now: () => number = () => Date.now(),
): RoomRegistry {
  return {
    rooms: new Map(),
    loadScene,
    saveScene,
    now,
  }
}

/**
 * Rooms spin up lazily on first join (spec §2.5). The load promise is stored
 * on the Room so a burst of simultaneous joins shares one read instead of
 * racing each other to overwrite the scene.
 */
function ensureRoom(registry: RoomRegistry, roomId: string): Room {
  const existing = registry.rooms.get(roomId)
  if (existing) return existing

  const room: Room = {
    id: roomId,
    seats: new Map(),
    follows: new Map(),
    loaded: Promise.resolve(),
    persistable: false,
    elements: [],
    ownerId: null,
    dirty: false,
    flushTimer: null,
    flushing: Promise.resolve(),
  }
  registry.rooms.set(roomId, room)
  room.loaded = registry.loadScene(roomId).then(
    (stored) => {
      room.elements = stored.elements
      room.ownerId = stored.ownerId
      // Unreadable stored JSON leaves the Room open but mute: the drawing rendered as an empty canvas here, and
      // writing that emptiness back is how a recoverable file becomes an
      // empty one. It is the same call the solo canvas makes when it pauses
      // autosave over a corrupt scene.
      room.persistable = stored.readable
    },
    (error) => {
      // A Room that can't read can't save either. Drop it and hang up, so
      // clients keep their copy and reconnect into a fresh read.
      console.error(`[collab] could not load scene for room ${roomId}`, error)
      if (registry.rooms.get(roomId) === room) registry.rooms.delete(roomId)
      const seats = [...room.seats.values()]
      room.seats.clear()
      room.follows.clear()
      for (const { peer } of seats) peer.close(1011, "Scene unavailable")
    },
  )
  return room
}

function disarmFlush(room: Room) {
  if (room.flushTimer === null) return
  clearTimeout(room.flushTimer)
  room.flushTimer = null
}

/**
 * Work this Room still owes the database. A Room that may not write has none
 * by definition, however much it has accumulated — without that clause a
 * drawing whose read failed would be marked dirty forever, and `reapIfIdle`
 * below would keep its Room in the registry for the life of the process,
 * never re-reading the drawing and never persisting another thing.
 */
const hasUnwrittenWork = (room: Room) => room.dirty && room.persistable

/**
 * A Room with nothing left to hold it open — no sockets, nothing unwritten —
 * is torn down, so the next join reads the drawing fresh (spec §2.5). Called
 * after every write rather than only from `leaveRoom` because the last
 * participant can leave while a write is still in flight, and a Room whose
 * flush had to be retried must not be dropped while it still owes one.
 */
function reapIfIdle(registry: RoomRegistry, room: Room) {
  if (room.seats.size > 0 || hasUnwrittenWork(room)) return
  if (registry.rooms.get(room.id) !== room) return
  disarmFlush(room)
  registry.rooms.delete(room.id)
}

function armFlush(registry: RoomRegistry, room: Room) {
  if (room.flushTimer !== null || !room.persistable) return
  room.flushTimer = setTimeout(() => {
    room.flushTimer = null
    void flushRoom(registry, room)
  }, ROOM_FLUSH_INTERVAL_MS)
}

/** The scene changed: schedule the trailing write of spec §2.3. */
function markDirty(registry: RoomRegistry, room: Room) {
  room.dirty = true
  armFlush(registry, room)
}

/**
 * Write the Room's scene now, if it has anything unwritten. Resolves when the
 * write has landed, which is what makes the last-leave and SIGTERM flushes
 * meaningful — both have to know the drawing is safe before they let go.
 *
 * Writes are chained onto `flushing` rather than fired in parallel: the
 * throttle firing just as the last participant leaves would otherwise put two
 * read-modify-writes on the same row in flight at once, and the older one
 * could land last.
 */
function flushRoom(registry: RoomRegistry, room: Room): Promise<void> {
  disarmFlush(room)
  if (!hasUnwrittenWork(room)) return room.flushing

  room.dirty = false
  room.flushing = room.flushing.then(() =>
    // Read the scene inside the chain, not at call time: anything merged
    // while an earlier write was in flight rides along on this one.
    registry.saveScene(room.id, room.elements).then(
      () => {
        reapIfIdle(registry, room)
      },
      (error) => {
        // A failed write is not lost work — the scene is still in memory. Mark
        // it unwritten again and let the throttle retry; a Room whose last
        // participant has already left keeps retrying (and stays in the
        // registry) until the write lands rather than dropping the edits.
        console.error(`[collab] could not flush room ${room.id}`, error)
        room.dirty = true
        armFlush(registry, room)
      },
    ),
  )
  return room.flushing
}

/**
 * Every Room's final write, for graceful shutdown (spec §2.3, rollout note 3).
 * Rooms stay in the registry: the process is going away, and tearing them
 * down would only race the sockets that are about to close with it.
 */
export async function flushAllRooms(registry: RoomRegistry): Promise<void> {
  await Promise.all(
    [...registry.rooms.values()].map((room) => flushRoom(registry, room)),
  )
}

function rosterOf(room: Room): Participant[] {
  return [...room.seats.values()].map((seat) => seat.participant)
}

const rosterMessage = (room: Room): ServerMessage => ({
  type: "PARTICIPANTS",
  payload: { participants: rosterOf(room) },
})

/** To the peer itself, and to everyone else via the room topic. */
function broadcastRoster(peer: RoomPeer, room: Room) {
  const message = rosterMessage(room)
  peer.send(message)
  peer.publish(ROOM_TOPIC, message)
}

/**
 * Concurrent sockets one Room accepts (spec §4.5). Far above any real
 * trusted-circle session — what it stops is a script holding sockets open
 * until the process runs out of them.
 */
export const MAX_ROOM_PARTICIPANTS = 25

/**
 * How long a connection may go silent before the Room stops believing in it.
 * Clients heartbeat every 25 s (spec §5.3), so this is three-and-a-half
 * missed beats — a live tab would have to be unreachable for a minute and a
 * half to be mistaken for a ghost, and a ghost is only ever *forgotten*, so
 * the cost of being wrong is a roster the next frame puts back.
 */
export const PARTICIPANT_IDLE_TIMEOUT_MS = 90_000

/**
 * Forget connections that have gone silent. A half-open socket holds a seat
 * against the cap, and there are only 25 — so a room a flaky network has
 * filled with ghosts would refuse the very reconnect of spec §5.3, and the
 * returning tab would land on "this drawing is full" holding an unmerged
 * scene. That is the "no lost work" promise broken by bookkeeping.
 *
 * Swept on join rather than on a timer: joining is the only moment a ghost
 * costs anything, and a timer would be one more thing to own and shut down.
 *
 * The Room itself is never torn down here even if this empties it — the join
 * that triggered the sweep is about to take a seat in it, and dropping it
 * would throw away an authoritative scene that may still owe the database a
 * write.
 */
function forgetSilentParticipants(room: Room, now: number) {
  for (const [connectionId, seat] of room.seats) {
    if (now - seat.lastSeenAt < PARTICIPANT_IDLE_TIMEOUT_MS) continue
    forgetConnection(room, connectionId)
  }
}

/**
 * Drop one connection from the Room, however it went: left, went silent, or
 * its link died. The peer it was trailing is told its audience shrank.
 */
function forgetConnection(room: Room, connectionId: string) {
  room.seats.delete(connectionId)

  const wasFollowing = room.follows.get(connectionId) ?? null
  room.follows.delete(connectionId)
  for (const follower of followersOf(room, connectionId))
    room.follows.delete(follower)
  if (wasFollowing) sendFollowedBy(room, wasFollowing)
}

export type RoomJoinResult =
  | { status: "ok" }
  /** The Room is at its cap; the visitor gets the "drawing full" page. */
  | { status: "full" }

export async function joinRoom(
  registry: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  identity: ParticipantIdentity,
): Promise<RoomJoinResult> {
  // Checked before the Room is created, so a refused join never leaves an
  // empty one behind — and never starts a scene read for a peer that is
  // about to be turned away. Ghosts are swept first: a seat nobody is
  // sitting in must not be what turns a reconnect away.
  const existing = registry.rooms.get(roomId)
  if (existing) {
    forgetSilentParticipants(existing, registry.now())
    if (existing.seats.size >= MAX_ROOM_PARTICIPANTS) return { status: "full" }
  }

  const room = ensureRoom(registry, roomId)

  const isGuest = identity.userId === null
  const participant: Participant = {
    connectionId: peer.id,
    // A guest wears a server-side pseudonym until its JOIN arrives, so it is
    // never nameless in the roster; a member's name comes from the session.
    name: identity.displayName?.trim() || guestNameForConnection(peer.id),
    color: pickParticipantColor(rosterOf(room).map((p) => p.color)),
    isGuest,
  }
  room.seats.set(peer.id, {
    participant,
    peer,
    userId: identity.userId,
    lastSeenAt: registry.now(),
  })

  peer.subscribe(ROOM_TOPIC)
  // Presence goes out before the scene read so avatars never wait on the
  // database; the canvas fills in a beat later.
  peer.send({
    type: "ROOM_JOINED",
    payload: { connectionId: peer.id, participants: rosterOf(room) },
  })
  peer.publish(ROOM_TOPIC, rosterMessage(room))

  await room.loaded
  // A late joiner gets the authoritative scene, not whatever its own page
  // load happened to fetch (spec §5.2).
  if (room.seats.has(peer.id)) {
    peer.send({ type: "SCENE_INIT", payload: { elements: room.elements } })
  }
  return { status: "ok" }
}

const followersOf = (room: Room, followedId: string) =>
  [...room.follows.entries()]
    .filter(([, followed]) => followed === followedId)
    .map(([follower]) => follower)

/**
 * Everyone this peer is trailing, directly or down the chain. A viewport
 * must never be relayed back into it: A→B→C→A would hand each peer bounds
 * that move its canvas, which publishes bounds of its own, forever. Walking
 * the whole chain rather than checking the one reciprocal edge is what makes
 * that true for rings of any size.
 *
 * A chain is at most as long as the room, and the visited set means a cycle
 * already in the map (one built before this guard existed, say) terminates
 * the walk rather than hanging it.
 */
function upstreamOf(room: Room, peerId: string): Set<string> {
  const upstream = new Set<string>()
  let cursor = room.follows.get(peerId)
  while (cursor && !upstream.has(cursor)) {
    upstream.add(cursor)
    cursor = room.follows.get(cursor)
  }
  return upstream
}

/**
 * Tell one peer who is currently trailing it. That list is what decides
 * whether it relays its viewport at all, so a peer nobody follows stays
 * silent.
 */
function sendFollowedBy(room: Room, followedId: string) {
  room.seats.get(followedId)?.peer.send({
    type: "FOLLOWED_BY",
    payload: { connectionIds: followersOf(room, followedId) },
  })
}

function setFollowTarget(
  room: Room,
  followerId: string,
  target: string | null,
) {
  // Following yourself or someone who isn't in the room means "nobody" —
  // the alternative is a client able to plant unreachable entries in the map.
  const followed =
    target && target !== followerId && room.seats.has(target) ? target : null
  const previous = room.follows.get(followerId) ?? null
  if (previous === followed) return

  if (followed) room.follows.set(followerId, followed)
  else room.follows.delete(followerId)

  if (previous) sendFollowedBy(room, previous)
  if (followed) sendFollowedBy(room, followed)
}

/**
 * Merge a peer's delta into the Room and tell the room what won.
 *
 * The reply is per-element, not the whole scene: everyone else hears the
 * winning version of each element the sender touched, and the sender hears
 * back only the elements where the Room's copy beat its own — the correction
 * that lets a peer whose delta was discarded converge instead of sitting on a
 * version nobody else has.
 *
 * Returns whether the Room's own copy actually moved — what decides if there
 * is anything new to persist. A delta that lost every comparison leaves the
 * scene exactly as it was, and re-writing it would be a database round trip
 * for nothing.
 *
 * That question is answered by identity, not by the scene version: reconciliation
 * keeps the winning object by reference, so an element the Room replaced is a
 * different object than the one it held. A version sum cannot see the
 * versionNonce tie-break — a remote element with the same `version` and a
 * lower nonce wins, is relayed to every peer, and leaves the sum and the count
 * exactly where they were. Persisting off the sum would let that content
 * converge everywhere except the database.
 */
function applySceneUpdate(
  room: Room,
  peer: RoomPeer,
  incoming: SceneElement[],
): boolean {
  const previous = room.elements
  const previousById = new Map(previous.map((el) => [el.id, el]))
  room.elements = reconcileElements(previous, incoming, {})
  const changed =
    room.elements.length !== previous.length ||
    room.elements.some((el) => previousById.get(el.id) !== el)

  // Reconciliation keeps whichever object won by reference, so `winner ===
  // element` is exactly "the Room accepted what this peer sent" — no need to
  // re-run the version comparison to find out.
  const authoritative = new Map(room.elements.map((el) => [el.id, el]))
  const winners: SceneElement[] = []
  const corrections: SceneElement[] = []
  const seen = new Set<string>()
  for (const element of incoming) {
    if (seen.has(element.id)) continue
    seen.add(element.id)
    const winner = authoritative.get(element.id) ?? element
    winners.push(winner)
    if (winner !== element) corrections.push(winner)
  }

  if (winners.length)
    peer.publish(ROOM_TOPIC, {
      type: "SCENE_UPDATE",
      payload: { elements: winners },
    })
  if (corrections.length)
    peer.send({ type: "SCENE_UPDATE", payload: { elements: corrections } })

  return changed
}

/**
 * What the transport should do with a socket after handing over a frame.
 *
 * `evicted` is the one answer it must act on: the Room has forgotten this
 * connection — its seat swept as a ghost while the socket was suspended —
 * so everything the socket sends from here would be dropped on the floor,
 * silently, forever. Closing it is what turns a client that believes it is
 * connected into one that rejoins.
 */
export type FrameOutcome = "ok" | "evicted"

export async function receiveFromPeer(
  registry: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  raw: string,
): Promise<FrameOutcome> {
  const message = parseClientMessage(raw)
  if (!message) return "ok"

  const room = registry.rooms.get(roomId)
  // No Room at all is not an eviction — the socket belongs to a drawing
  // nobody is in, and the close hook will tidy it up on its own.
  if (!room) return "ok"

  const seat = room.seats.get(peer.id)
  if (!seat) return "evicted"

  // Any frame at all is proof of life, and `PING` most of all: it is the only
  // one a room where nobody is drawing will ever produce. Stamped before the
  // answer goes out, so the seat this heartbeat is defending is held for the
  // full window rather than the window minus a round trip.
  seat.lastSeenAt = registry.now()

  switch (message.type) {
    case "PING":
      // Only a seated peer gets a PONG, so an evicted client never looks healthy.
      peer.send({ type: "PONG", payload: {} })
      return "ok"

    case "JOIN": {
      // Only guests name themselves; a member's name comes from the session.
      const { participant } = seat
      if (!participant.isGuest || participant.name === message.payload.name)
        return "ok"
      seat.participant = { ...participant, name: message.payload.name }
      broadcastRoster(peer, room)
      return "ok"
    }

    case "USER_FOLLOW":
      setFollowTarget(room, peer.id, message.payload.followedConnectionId)
      return "ok"

    case "USER_VISIBLE_SCENE_BOUNDS": {
      const upstream = upstreamOf(room, peer.id)
      for (const followerId of followersOf(room, peer.id)) {
        // Skip only the edges that would close a loop.
        if (upstream.has(followerId)) continue
        room.seats.get(followerId)?.peer.send({
          type: "USER_VISIBLE_SCENE_BOUNDS",
          payload: { connectionId: peer.id, bounds: message.payload.bounds },
        })
      }
      return "ok"
    }

    case "SCENE_UPDATE":
      // Wait for the stored scene, or the merge would drop it. Deltas keep
      // their order: they all queue behind the same promise.
      await room.loaded
      if (!room.seats.has(peer.id)) return "evicted"
      if (applySceneUpdate(room, peer, message.payload.elements))
        markDirty(registry, room)
      return "ok"

    case "MOUSE_LOCATION":
      peer.publish(ROOM_TOPIC, {
        type: "MOUSE_LOCATION",
        payload: { ...message.payload, connectionId: peer.id },
      })
      return "ok"

    default:
      return message satisfies never
  }
}

export async function leaveRoom(
  registry: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
) {
  const room = registry.rooms.get(roomId)
  if (!room?.seats.has(peer.id)) return
  forgetConnection(room, peer.id)

  // The last socket out writes the scene before the Room is torn down
  // (spec §2.3) — otherwise everything since the last throttle tick would
  // die with it, which is exactly the "guest edits survive the owner closing
  // their tab" case. `reapIfIdle` rather than an unconditional delete: a
  // rejoin during the write keeps the Room, and a write that has to be
  // retried keeps it too.
  if (room.seats.size === 0) {
    await flushRoom(registry, room)
    reapIfIdle(registry, room)
    return
  }
  peer.publish(ROOM_TOPIC, rosterMessage(room))
}

// --- link lifecycle (spec §4.2, §5.1) -----------------------------------

/** The one thing an evicted socket is told, whatever killed its link. */
const closeAsDead = (peer: RoomPeer) =>
  peer.close(LINK_DEAD_CLOSE_CODE, LINK_DEAD_CLOSE_REASON)

/**
 * End a Room and hang up on everyone in it — the single termination path
 * behind stop sharing, regenerate, and trash (spec §4.2, §4.3, §5.1). All
 * three differ only in what they did to the `shares` row first; from here on
 * they are the same three steps in the same order.
 *
 * The Room is frozen, then written, and only then hung up on. The write
 * comes before the closes and is awaited, which is what makes "guest work up
 * to the moment of trash is preserved" true; it is also what lets the owner's
 * tab resume classic autosave the instant the mutation resolves (spec §5.5),
 * because by then the Room has written what it had.
 *
 * The Room is then dropped rather than left standing empty, so re-sharing
 * later spins one up that reads the drawing fresh. `reapIfIdle` keeps the one
 * exception it always keeps: a write the database refused is retried on the
 * throttle, and a Room that still owes one keeps its place until it lands.
 * That is the case where "written before the sockets close" is best effort
 * rather than a guarantee — a retry can land after the owner has resumed
 * autosave and overwrite it with the scene as the Room last saw it. The
 * alternative is holding sockets open on a link that is already dead while a
 * database that is refusing writes comes back, which is worse; and the owner
 * is not editing blind through it, because their own saves are failing too
 * and say so.
 */
export async function terminateRoom(
  registry: RoomRegistry,
  roomId: string,
): Promise<void> {
  const room = registry.rooms.get(roomId)
  if (!room) return

  // An edit that arrived before this call is still queued behind the scene
  // read (see `receiveFromPeer`), and waiting on the same promise puts this
  // behind it — so the flush below carries it rather than leaving it to a
  // throttle tick after the sockets are already gone.
  await room.loaded

  // Then the roster goes, *before* the flush rather than after it. Emptying
  // it is what freezes the Room: `receiveFromPeer` answers a frame from a
  // connection with no seat with "evicted" and merges nothing, so the scene
  // handed to the write below is the last one there will ever be.
  //
  // Clearing afterwards instead leaves a window the length of a database
  // round trip in which a peer still has a seat: its edit merges into a Room
  // whose write is already in flight with the previous array, marks the Room
  // dirty again, and survives only as a 15 s retry — landing after the owner
  // has resumed classic autosave (spec §5.5) and overwriting whatever they
  // have saved since. The stroke that loses the race is lost either way; what
  // this decides is whether it takes later work down with it.
  //
  // The peers are captured first because closing a socket is what fires the
  // route's `close` hook — `leaveRoom`, which must find nothing left to do
  // rather than taking itself for the last participant out and flushing again.
  const seats = [...room.seats.values()]
  room.seats.clear()
  room.follows.clear()

  await flushRoom(registry, room)
  reapIfIdle(registry, room)

  for (const { peer } of seats) closeAsDead(peer)
}

/**
 * Tightening a link's audience to `members` (spec §4.2): close the sockets
 * that never authenticated one, and leave everyone else exactly where they
 * are, mid-stroke. Loosening evicts nobody — it only affects who may join
 * next — so callers reach this for `members` and nothing else.
 *
 * Membership is read from `seat.userId`, which is what the *upgrade* established,
 * never from the roster's `isGuest`: the roster is the copy that goes on the
 * wire, and a client is exactly the thing that must not get a say in this.
 */
export async function evictNonMembers(
  registry: RoomRegistry,
  roomId: string,
): Promise<void> {
  const room = registry.rooms.get(roomId)
  if (!room) return

  // Same reason as `terminateRoom`: a guest's last stroke, sent a moment
  // before the audience tightened, merges before its seat is taken away.
  await room.loaded

  const evicted: RoomPeer[] = []
  for (const [connectionId, seat] of [...room.seats]) {
    if (seat.userId !== null) continue
    forgetConnection(room, connectionId)
    evicted.push(seat.peer)
  }
  if (evicted.length === 0) return

  if (room.seats.size === 0) {
    // The guests were the whole room: this is last-leave, and the scene has
    // to be written before the Room is let go.
    await flushRoom(registry, room)
    reapIfIdle(registry, room)
  } else {
    // Sent rather than published: the peers whose sockets could have fanned
    // this out are the ones being closed.
    const message = rosterMessage(room)
    for (const { peer } of room.seats.values()) peer.send(message)
  }

  for (const peer of evicted) closeAsDead(peer)
}
