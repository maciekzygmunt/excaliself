// Guests pick a pseudonym client-side (no server record); members get their
// session name, which the client can't override.

import type { ParticipantColor } from "./protocol"

const ADJECTIVES = [
  "Amber",
  "Brisk",
  "Calm",
  "Copper",
  "Dusty",
  "Eager",
  "Fond",
  "Gentle",
  "Hazy",
  "Keen",
  "Lucky",
  "Mellow",
  "Nimble",
  "Quiet",
  "Rapid",
  "Sunny",
  "Tidy",
  "Velvet",
  "Wry",
  "Zesty",
] as const

const ANIMALS = [
  "Auk",
  "Badger",
  "Crane",
  "Dolphin",
  "Egret",
  "Ferret",
  "Gecko",
  "Heron",
  "Ibis",
  "Jackdaw",
  "Kestrel",
  "Lynx",
  "Marten",
  "Newt",
  "Otter",
  "Puffin",
  "Quokka",
  "Raven",
  "Stoat",
  "Tapir",
] as const

/** FNV-1a, so the same connection id always yields the same pseudonym. */
function hashSeed(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function guestNameFromSeed(seed: number): string {
  const adjective = ADJECTIVES[seed % ADJECTIVES.length]
  const animal = ANIMALS[Math.floor(seed / ADJECTIVES.length) % ANIMALS.length]
  return `${adjective} ${animal}`
}

/** The server's stand-in name for a socket that hasn't sent its own yet. */
export function guestNameForConnection(connectionId: string): string {
  return guestNameFromSeed(hashSeed(connectionId))
}

/** Falls back to the email's local part, since `users.name` can be blank. */
export function memberDisplayName(user: {
  name?: string | null
  email?: string | null
}): string {
  const name = user.name?.trim()
  if (name) return name
  const local = user.email?.split("@")[0]?.trim()
  return local || "Member"
}

/** First and last initials for an avatar. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0]
  const last = words.length > 1 ? words[words.length - 1] : ""
  return [first, last]
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2)
}

/** Excalidraw's collaborator palette. Server-side, as the live badge reads it too. */
export const PARTICIPANT_COLORS: readonly ParticipantColor[] = [
  { background: "#fa5252", stroke: "#c92a2a" },
  { background: "#e64980", stroke: "#a61e4d" },
  { background: "#be4bdb", stroke: "#862e9c" },
  { background: "#7950f2", stroke: "#5f3dc4" },
  { background: "#4c6ef5", stroke: "#364fc7" },
  { background: "#228be6", stroke: "#1864ab" },
  { background: "#12b886", stroke: "#087f5b" },
  { background: "#f76707", stroke: "#d9480f" },
]

/** First unused color; wraps once the palette runs out. */
export function pickParticipantColor(
  taken: readonly ParticipantColor[],
): ParticipantColor {
  const used = new Set(taken.map((color) => color.background))
  return (
    PARTICIPANT_COLORS.find((color) => !used.has(color.background)) ??
    PARTICIPANT_COLORS[taken.length % PARTICIPANT_COLORS.length]
  )
}
