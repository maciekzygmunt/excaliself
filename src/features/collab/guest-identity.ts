/**
 * The guest's display name, kept only in the browser (spec §1.3, §4.4): no
 * account, no cookie, no server-side guest record. Generated once and
 * remembered, so reconnecting — or opening a second shared drawing — keeps
 * the same name behind a fresh connection id.
 */

import { guestNameFromSeed } from "./identity"
import { sanitizeName } from "./protocol"

export const GUEST_NAME_STORAGE_KEY = "excaliself:guest-name"

function randomSeed(): number {
  return Math.floor(Math.random() * 0xff_ff_ff_ff)
}

/**
 * Storage is optional and every access is guarded: private-mode Safari
 * throws on `localStorage`, and a guest without persistence should still get
 * a working name for the session rather than an error.
 */
export function getOrCreateGuestName(storage?: Storage | null): string {
  const stored = readGuestName(storage)
  if (stored) return stored

  const name = guestNameFromSeed(randomSeed())
  try {
    storage?.setItem(GUEST_NAME_STORAGE_KEY, name)
  } catch {
    // Unwritable storage: the name lives for this page load only.
  }
  return name
}

function readGuestName(storage?: Storage | null): string | null {
  try {
    return sanitizeName(storage?.getItem(GUEST_NAME_STORAGE_KEY))
  } catch {
    return null
  }
}
