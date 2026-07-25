/**
 * The room wire protocol (canvas sharing spec §2.2), minus the E2E envelope
 * upstream excalidraw-room wraps everything in — plain JSON over a raw
 * websocket. This slice carries presence and cursors only; scene traffic
 * (SCENE_INIT / SCENE_UPDATE) joins the union in the sync slice.
 *
 * Both ends parse with hand-written guards rather than a schema library:
 * the shapes are tiny and fixed, MOUSE_LOCATION runs at ~30 Hz per peer, and
 * the guest page must not pay for a validator in its bundle.
 *
 * Follow mode (spec §1.3) adds two directed channels on top of the room's
 * broadcast: a follower tells the server who it is trailing (`USER_FOLLOW`),
 * and the followed peer — told it has an audience by `FOLLOWED_BY` — relays
 * its viewport (`VIEWPORT_BOUNDS`) to exactly those followers.
 */

/** The single pub/sub topic every peer in a room subscribes to. */
export const ROOM_TOPIC = "room"

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
 * The visible region of a follower's target, in scene coordinates —
 * structurally Excalidraw's `SceneBounds`, restated here so the server never
 * has to import the canvas package.
 */
export type SceneBounds = readonly [number, number, number, number]

export type ClientMessage =
  /** Sent once on open; carries the guest's locally-stored display name. */
  | { type: "JOIN"; payload: { name: string } }
  | { type: "MOUSE_LOCATION"; payload: PointerUpdate }
  /** Who this tab is following now; null when it stopped. */
  | { type: "USER_FOLLOW"; payload: { followedConnectionId: string | null } }
  /** Sent only while someone is following this tab. */
  | { type: "VIEWPORT_BOUNDS"; payload: { bounds: SceneBounds } }

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
  /** Who is currently trailing this tab; empty means nobody is. */
  | { type: "FOLLOWED_BY"; payload: { connectionIds: string[] } }
  | {
      type: "VIEWPORT_BOUNDS"
      payload: { connectionId: string; bounds: SceneBounds }
    }

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

  if (decoded.type === "JOIN") {
    if (!isRecord(decoded.payload)) return null
    const name = sanitizeName(decoded.payload.name)
    return name === null ? null : { type: "JOIN", payload: { name } }
  }

  if (decoded.type === "MOUSE_LOCATION") {
    const payload = parsePointerUpdate(decoded.payload)
    return payload === null ? null : { type: "MOUSE_LOCATION", payload }
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

  if (decoded.type === "VIEWPORT_BOUNDS") {
    if (!isRecord(decoded.payload)) return null
    const bounds = parseSceneBounds(decoded.payload.bounds)
    return bounds === null
      ? null
      : { type: "VIEWPORT_BOUNDS", payload: { bounds } }
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
  if (!isRecord(decoded) || !isRecord(decoded.payload)) return null
  const payload = decoded.payload

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

  if (decoded.type === "FOLLOWED_BY") {
    const { connectionIds } = payload
    if (!Array.isArray(connectionIds)) return null
    if (!connectionIds.every((id) => typeof id === "string")) return null
    return { type: "FOLLOWED_BY", payload: { connectionIds } }
  }

  if (decoded.type === "VIEWPORT_BOUNDS") {
    const bounds = parseSceneBounds(payload.bounds)
    if (!bounds || typeof payload.connectionId !== "string") return null
    return {
      type: "VIEWPORT_BOUNDS",
      payload: { connectionId: payload.connectionId, bounds },
    }
  }

  return null
}
