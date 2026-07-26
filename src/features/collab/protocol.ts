/**
 * The room wire protocol (canvas sharing spec §2.2), minus the E2E envelope
 * upstream excalidraw-room wraps everything in — plain JSON over a raw
 * websocket: presence and cursors, plus the scene traffic (SCENE_INIT on
 * join, SCENE_UPDATE deltas afterwards).
 *
 * Both ends parse with hand-written guards rather than a schema library:
 * the shapes are tiny and fixed, MOUSE_LOCATION runs at ~30 Hz per peer, and
 * the guest page must not pay for a validator in its bundle.
 *
 * Follow mode (spec §1.3) adds two directed channels on top of the room's
 * broadcast: a follower tells the server who it is trailing (`USER_FOLLOW`),
 * and the followed peer — told it has an audience by `FOLLOWED_BY` — relays
 * its viewport (`USER_VISIBLE_SCENE_BOUNDS`) to exactly those followers.
 *
 * `PING`/`PONG` are the app-level heartbeat of spec §5.3. They are here
 * rather than at the transport level because a browser cannot send websocket
 * ping frames from JavaScript at all — only the server side of a connection
 * can, and it is the client that needs to know its socket has gone quiet.
 */

/** The single pub/sub topic every peer in a room subscribes to. */
export const ROOM_TOPIC = "room"

/**
 * Close code for a join the participant cap refused (spec §4.5). It lives in
 * the application-private 4000–4999 range because that is the only range a
 * server may send and the browser hands to the client intact — a refused
 * upgrade, by contrast, reaches the page as an indistinguishable 1006. The
 * number echoes HTTP 429: too many, come back later.
 */
export const ROOM_FULL_CLOSE_CODE = 4029

/**
 * Close code for a socket whose token no longer checks out (spec §5.3). Same
 * reasoning as the cap's code: the upgrade *could* simply be refused, but a
 * refused handshake is an opaque 1006 the client cannot tell from a server
 * that is merely down — and "down" means retry forever, which is exactly the
 * loop a killed link must not spin in. Accepting the socket only to close it
 * with a code the page can read is what routes it to the dead-link state
 * instead. The number echoes HTTP 410 Gone.
 */
export const LINK_DEAD_CLOSE_CODE = 4010

/**
 * The reason string that rides along with it. Nothing reads it — the code is
 * the whole message — but the two places that hang up on a dead link (a
 * refused upgrade, and a link killed under a live socket) say the same thing
 * in the logs.
 */
export const LINK_DEAD_CLOSE_REASON = "Link no longer active"

/** Cursor and avatar color, in Excalidraw's `Collaborator["color"]` shape. */
export type ParticipantColor = { background: string; stroke: string }

/**
 * One connected socket, as everyone else sees it. `connectionId` is the
 * random per-socket id minted at upgrade (spec §4.4) — never a userId, so
 * nothing about a member's account leaks to guests in the room.
 */
export type Participant = {
  connectionId: string
  name: string
  color: ParticipantColor
  isGuest: boolean
}

export type PointerUpdate = {
  pointer: { x: number; y: number; tool: "pointer" | "laser" }
  button: "up" | "down"
  selectedElementIds: Record<string, true>
}

/**
 * One Excalidraw element as it crosses the wire. Only the three fields the
 * merge rule reads are typed; every other property rides along untouched, so
 * the server never has to know what an element is made of — and a newer
 * client's properties survive a round trip through an older server.
 */
export type SceneElement = {
  id: string
  version: number
  versionNonce: number
  /** Fractional index — the ordering key. Null on pre-index elements. */
  index?: string | null
  isDeleted?: boolean
  [key: string]: unknown
}

/**
 * The visible region of a follower's target, in scene coordinates —
 * structurally Excalidraw's `SceneBounds`, restated here so the server never
 * has to import the canvas package.
 */
export type SceneBounds = readonly [number, number, number, number]

export type ClientMessage =
  /** Sent once on open; carries the guest's locally-stored display name. */
  | { type: "JOIN"; payload: { name: string } }
  | { type: "MOUSE_LOCATION"; payload: PointerUpdate }
  /** A delta: only the elements this peer has changed since it last sent. */
  | { type: "SCENE_UPDATE"; payload: { elements: SceneElement[] } }
  /** Who this tab is following now; null when it stopped. */
  | { type: "USER_FOLLOW"; payload: { followedConnectionId: string | null } }
  /** Sent only while someone is following this tab. */
  | { type: "USER_VISIBLE_SCENE_BOUNDS"; payload: { bounds: SceneBounds } }
  /**
   * Heartbeat (spec §5.3). It carries nothing — its whole job is to be
   * traffic — but it carries an empty payload rather than none, so every
   * message in the protocol has the same shape and nothing downstream has to
   * ask whether this one does.
   */
  | { type: "PING"; payload: Record<string, never> }

export type ServerMessage =
  /** First frame back: who you are in this room, and who else is here. */
  | {
      type: "ROOM_JOINED"
      payload: { connectionId: string; participants: Participant[] }
    }
  /** The full roster, re-sent whenever it changes. */
  | { type: "PARTICIPANTS"; payload: { participants: Participant[] } }
  | {
      type: "MOUSE_LOCATION"
      payload: PointerUpdate & { connectionId: string }
    }
  /** The Room's whole authoritative scene, sent once per join (spec §5.2). */
  | { type: "SCENE_INIT"; payload: { elements: SceneElement[] } }
  /**
   * The Room's ruling on elements someone just changed — usually the sender's
   * own version relayed on, but the Room's copy instead wherever the incoming
   * one lost reconciliation.
   */
  | { type: "SCENE_UPDATE"; payload: { elements: SceneElement[] } }
  /** Who is currently trailing this tab; empty means nobody is. */
  | { type: "FOLLOWED_BY"; payload: { connectionIds: string[] } }
  | {
      type: "USER_VISIBLE_SCENE_BOUNDS"
      payload: { connectionId: string; bounds: SceneBounds }
    }
  /**
   * The answer to a `PING`. Traffic in the other direction matters as much as
   * the ping itself: an idle timeout that only watches one direction would
   * still fire on a socket the client alone is keeping warm.
   */
  | { type: "PONG"; payload: Record<string, never> }

/** Longest display name accepted from a peer, in code points. */
export const MAX_NAME_LENGTH = 40

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Names cross the wire from unauthenticated guests, so they are clamped here
 * rather than at every render site. Returns null for anything unusable, which
 * leaves the server-assigned pseudonym in place.
 */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null
  // Strip control characters (including the newlines that would let a name
  // fake a second UI line) before measuring.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
  if (!trimmed) return null
  return [...trimmed].slice(0, MAX_NAME_LENGTH).join("")
}

function parsePointerUpdate(payload: unknown): PointerUpdate | null {
  if (!isRecord(payload)) return null
  const { pointer, button, selectedElementIds } = payload
  if (!isRecord(pointer)) return null
  if (!isFiniteNumber(pointer.x) || !isFiniteNumber(pointer.y)) return null
  if (pointer.tool !== "pointer" && pointer.tool !== "laser") return null
  if (button !== "up" && button !== "down") return null

  const selected: Record<string, true> = {}
  if (isRecord(selectedElementIds)) {
    for (const id of Object.keys(selectedElementIds)) selected[id] = true
  }
  return {
    pointer: { x: pointer.x, y: pointer.y, tool: pointer.tool },
    button,
    selectedElementIds: selected,
  }
}

function parseSceneBounds(value: unknown): SceneBounds | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  if (!value.every(isFiniteNumber)) return null
  const [x1, y1, x2, y2] = value as number[]
  return [x1, y1, x2, y2]
}

/**
 * Elements are validated only as far as the merge rule needs them — an id and
 * two numbers. Everything else is left alone rather than whitelisted: the
 * Room is a relay for element bodies, and a field it stripped would be a
 * property silently lost from someone's drawing.
 *
 * One bad entry rejects the whole payload. A half-applied delta would leave
 * the Room holding a scene no client ever had.
 */
function parseSceneElements(value: unknown): SceneElement[] | null {
  if (!Array.isArray(value)) return null
  const elements: SceneElement[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const { id, version, versionNonce, index } = entry
    if (typeof id !== "string" || !id) return null
    if (!isFiniteNumber(version) || !isFiniteNumber(versionNonce)) return null
    if (index !== undefined && index !== null && typeof index !== "string")
      return null
    elements.push(entry as SceneElement)
  }
  return elements
}

function parseSceneMessage(payload: Record<string, unknown>) {
  const elements = parseSceneElements(payload.elements)
  return elements === null ? null : { elements }
}

/**
 * Anything unrecognized returns null and is dropped by the caller: a peer
 * cannot crash the room by sending garbage, and unknown message types are
 * simply ignored (so an older client talking to a newer server degrades
 * instead of erroring).
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(decoded)) return null

  if (decoded.type === "PING") return { type: "PING", payload: {} }

  if (decoded.type === "JOIN") {
    if (!isRecord(decoded.payload)) return null
    const name = sanitizeName(decoded.payload.name)
    return name === null ? null : { type: "JOIN", payload: { name } }
  }

  if (decoded.type === "MOUSE_LOCATION") {
    const payload = parsePointerUpdate(decoded.payload)
    return payload === null ? null : { type: "MOUSE_LOCATION", payload }
  }

  if (decoded.type === "SCENE_UPDATE") {
    if (!isRecord(decoded.payload)) return null
    const payload = parseSceneMessage(decoded.payload)
    return payload === null ? null : { type: "SCENE_UPDATE", payload }
  }

  if (decoded.type === "USER_FOLLOW") {
    if (!isRecord(decoded.payload)) return null
    const followedConnectionId = decoded.payload.followedConnectionId
    if (
      typeof followedConnectionId !== "string" &&
      followedConnectionId !== null
    )
      return null
    return { type: "USER_FOLLOW", payload: { followedConnectionId } }
  }

  if (decoded.type === "USER_VISIBLE_SCENE_BOUNDS") {
    if (!isRecord(decoded.payload)) return null
    const bounds = parseSceneBounds(decoded.payload.bounds)
    return bounds === null
      ? null
      : { type: "USER_VISIBLE_SCENE_BOUNDS", payload: { bounds } }
  }

  return null
}

function parseParticipants(value: unknown): Participant[] | null {
  if (!Array.isArray(value)) return null
  const participants: Participant[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const { connectionId, name, color, isGuest } = entry
    if (typeof connectionId !== "string" || typeof name !== "string")
      return null
    if (!isRecord(color)) return null
    if (
      typeof color.background !== "string" ||
      typeof color.stroke !== "string"
    )
      return null
    participants.push({
      connectionId,
      name,
      color: { background: color.background, stroke: color.stroke },
      isGuest: isGuest === true,
    })
  }
  return participants
}

/**
 * The client's mirror of {@link parseClientMessage}. The server is trusted,
 * but a frame from a newer or older build must degrade to "ignored" rather
 * than throw inside a socket callback and take the canvas down with it.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(decoded)) return null
  if (!isRecord(decoded.payload)) return null
  const payload = decoded.payload

  if (decoded.type === "PONG") return { type: "PONG", payload: {} }

  if (decoded.type === "ROOM_JOINED" || decoded.type === "PARTICIPANTS") {
    const participants = parseParticipants(payload.participants)
    if (!participants) return null
    if (decoded.type === "PARTICIPANTS")
      return { type: "PARTICIPANTS", payload: { participants } }
    if (typeof payload.connectionId !== "string") return null
    return {
      type: "ROOM_JOINED",
      payload: { connectionId: payload.connectionId, participants },
    }
  }

  if (decoded.type === "MOUSE_LOCATION") {
    const pointer = parsePointerUpdate(payload)
    if (!pointer || typeof payload.connectionId !== "string") return null
    return {
      type: "MOUSE_LOCATION",
      payload: { ...pointer, connectionId: payload.connectionId },
    }
  }

  if (decoded.type === "SCENE_INIT" || decoded.type === "SCENE_UPDATE") {
    const scene = parseSceneMessage(payload)
    if (!scene) return null
    return decoded.type === "SCENE_INIT"
      ? { type: "SCENE_INIT", payload: scene }
      : { type: "SCENE_UPDATE", payload: scene }
  }

  if (decoded.type === "FOLLOWED_BY") {
    const { connectionIds } = payload
    if (!Array.isArray(connectionIds)) return null
    if (!connectionIds.every((id) => typeof id === "string")) return null
    return { type: "FOLLOWED_BY", payload: { connectionIds } }
  }

  if (decoded.type === "USER_VISIBLE_SCENE_BOUNDS") {
    const bounds = parseSceneBounds(payload.bounds)
    if (!bounds || typeof payload.connectionId !== "string") return null
    return {
      type: "USER_VISIBLE_SCENE_BOUNDS",
      payload: { connectionId: payload.connectionId, bounds },
    }
  }

  return null
}
