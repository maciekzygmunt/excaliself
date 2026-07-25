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
import { parseClientMessage, ROOM_TOPIC } from "./protocol"
import { getSceneVersion, reconcileElements } from "./reconcile"
import type { StoredScene } from "./scene-store"

/** The slice of a crossws `Peer` the room logic uses. */
export interface RoomPeer {
  /** crossws mints a random uuid per socket — the connection id of spec §4.4. */
  readonly id: string
  send(data: ServerMessage): void
  /** Fans out to the rest of the namespace; never echoes to the sender. */
  publish(topic: string, data: ServerMessage): void
  subscribe(topic: string): void
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

export type Room = {
  participants: Map<string, Participant>
  /**
   * The live socket behind each participant. Follow mode is the first thing
   * here that has to reach one named peer rather than the whole room, and
   * the pub/sub topic can only do the latter.
   */
  peers: Map<string, RoomPeer>
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
  sceneVersion: number
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
}

export function createRoomRegistry(
  loadScene: SceneLoader,
  saveScene: SceneSaver,
): RoomRegistry {
  return { rooms: new Map(), loadScene, saveScene }
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
    participants: new Map(),
    peers: new Map(),
    follows: new Map(),
    loaded: Promise.resolve(),
    persistable: false,
    elements: [],
    sceneVersion: 0,
    ownerId: null,
    dirty: false,
    flushTimer: null,
    flushing: Promise.resolve(),
  }
  registry.rooms.set(roomId, room)
  room.loaded = registry.loadScene(roomId).then(
    (stored) => {
      room.elements = stored.elements
      room.sceneVersion = getSceneVersion(stored.elements)
      room.ownerId = stored.ownerId
      room.persistable = true
    },
    (error) => {
      // The Room stays open on an empty scene: cursors and presence still
      // work, and a client's own copy survives reconciliation untouched (an
      // empty SCENE_INIT adds nothing and deletes nothing). `persistable`
      // stays false, so nothing this Room accumulates is ever written — a
      // flush here would put an empty scene over a real drawing.
      console.error(`[collab] could not load scene for room ${roomId}`, error)
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
 * A Room with nothing left to hold it open — no sockets, nothing unwritten —
 * is torn down, so the next join reads the drawing fresh (spec §2.5). Called
 * after every write rather than only from `leaveRoom` because the last
 * participant can leave while a write is still in flight, and a Room whose
 * flush had to be retried must not be dropped while it still owes one.
 */
function reapIfIdle(registry: RoomRegistry, roomId: string, room: Room) {
  if (room.participants.size > 0 || room.dirty) return
  if (registry.rooms.get(roomId) !== room) return
  disarmFlush(room)
  registry.rooms.delete(roomId)
}

function armFlush(registry: RoomRegistry, roomId: string, room: Room) {
  if (room.flushTimer !== null || !room.persistable) return
  room.flushTimer = setTimeout(() => {
    room.flushTimer = null
    void flushRoom(registry, roomId)
  }, ROOM_FLUSH_INTERVAL_MS)
}

/** The scene changed: schedule the trailing write of spec §2.3. */
function markDirty(registry: RoomRegistry, roomId: string, room: Room) {
  room.dirty = true
  armFlush(registry, roomId, room)
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
export function flushRoom(
  registry: RoomRegistry,
  roomId: string,
): Promise<void> {
  const room = registry.rooms.get(roomId)
  if (!room) return Promise.resolve()
  disarmFlush(room)
  if (!room.dirty || !room.persistable) return room.flushing

  room.dirty = false
  room.flushing = room.flushing.then(() =>
    // Read the scene inside the chain, not at call time: anything merged
    // while an earlier write was in flight rides along on this one.
    registry
      .saveScene(roomId, room.elements)
      .then(
        () => {
          reapIfIdle(registry, roomId, room)
        },
        (error) => {
          // A failed write is not lost work — the scene is still in memory. Mark
          // it unwritten again and let the throttle retry; a Room whose last
          // participant has already left keeps retrying (and stays in the
          // registry) until the write lands rather than dropping the edits.
          console.error(`[collab] could not flush room ${roomId}`, error)
          room.dirty = true
          armFlush(registry, roomId, room)
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
    [...registry.rooms.keys()].map((roomId) => flushRoom(registry, roomId)),
  )
}

function rosterOf(room: Room): Participant[] {
  return [...room.participants.values()]
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
  // about to be turned away.
  const existing = registry.rooms.get(roomId)
  if (existing && existing.participants.size >= MAX_ROOM_PARTICIPANTS)
    return { status: "full" }

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
  room.participants.set(peer.id, participant)
  room.peers.set(peer.id, peer)

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
  if (room.participants.has(peer.id)) {
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
  room.peers.get(followedId)?.send({
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
    target && target !== followerId && room.participants.has(target)
      ? target
      : null
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
 */
function applySceneUpdate(
  room: Room,
  peer: RoomPeer,
  incoming: SceneElement[],
): boolean {
  const previousCount = room.elements.length
  const previousVersion = room.sceneVersion
  room.elements = reconcileElements(room.elements, incoming, {})
  room.sceneVersion = getSceneVersion(room.elements)
  const changed =
    room.sceneVersion !== previousVersion ||
    room.elements.length !== previousCount

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

export async function receiveFromPeer(
  registry: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
  raw: string,
) {
  const room = registry.rooms.get(roomId)
  const participant = room?.participants.get(peer.id)
  if (!room || !participant) return

  const message = parseClientMessage(raw)
  if (!message) return

  if (message.type === "JOIN") {
    // Only guests name themselves. A member's name is whatever the session
    // says, so a compromised client can't pose as someone else in the room.
    if (!participant.isGuest || participant.name === message.payload.name)
      return
    room.participants.set(peer.id, {
      ...participant,
      name: message.payload.name,
    })
    broadcastRoster(peer, room)
    return
  }

  if (message.type === "USER_FOLLOW") {
    setFollowTarget(room, peer.id, message.payload.followedConnectionId)
    return
  }

  if (message.type === "USER_VISIBLE_SCENE_BOUNDS") {
    const upstream = upstreamOf(room, peer.id)
    for (const followerId of followersOf(room, peer.id)) {
      // Only the edges that would close a loop are dropped; anyone else
      // trailing this peer still gets the viewport. A plain chain — C follows
      // A, A follows B — is not a loop and keeps working.
      if (upstream.has(followerId)) continue
      room.peers.get(followerId)?.send({
        type: "USER_VISIBLE_SCENE_BOUNDS",
        payload: { connectionId: peer.id, bounds: message.payload.bounds },
      })
    }
    return
  }

  if (message.type === "SCENE_UPDATE") {
    // A client can start drawing before its SCENE_INIT lands. Merging into an
    // empty scene here would drop everything the drawing already had, so the
    // delta waits for the load — deltas keep their order because they all
    // queue behind the same settled promise.
    await room.loaded
    if (!room.participants.has(peer.id)) return
    if (applySceneUpdate(room, peer, message.payload.elements))
      markDirty(registry, roomId, room)
    return
  }

  peer.publish(ROOM_TOPIC, {
    type: "MOUSE_LOCATION",
    payload: { ...message.payload, connectionId: peer.id },
  })
}

export async function leaveRoom(
  registry: RoomRegistry,
  roomId: string,
  peer: RoomPeer,
) {
  const room = registry.rooms.get(roomId)
  if (!room?.participants.delete(peer.id)) return
  room.peers.delete(peer.id)

  // A departing peer both stops following and stops being followed. Its own
  // followers need no message — Excalidraw drops `userToFollow` by itself
  // once the followed collaborator falls out of the roster.
  const wasFollowing = room.follows.get(peer.id) ?? null
  room.follows.delete(peer.id)
  for (const followerId of followersOf(room, peer.id))
    room.follows.delete(followerId)
  if (wasFollowing) sendFollowedBy(room, wasFollowing)

  // The last socket out writes the scene before the Room is torn down
  // (spec §2.3) — otherwise everything since the last throttle tick would
  // die with it, which is exactly the "guest edits survive the owner closing
  // their tab" case. `reapIfIdle` rather than an unconditional delete: a
  // rejoin during the write keeps the Room, and a write that has to be
  // retried keeps it too.
  if (room.participants.size === 0) {
    await flushRoom(registry, roomId)
    reapIfIdle(registry, roomId, room)
    return
  }
  peer.publish(ROOM_TOPIC, rosterMessage(room))
}
