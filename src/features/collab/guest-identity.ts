/** The guest's display name, kept only in localStorage; no server-side record. */

import { guestNameFromSeed } from "./identity"
import { sanitizeName } from "./protocol"

export const GUEST_NAME_STORAGE_KEY = "excaliself:guest-name"

type StorageHost = { localStorage?: Storage }

function randomSeed(): number {
  return Math.floor(Math.random() * 0xff_ff_ff_ff)
}

// Chrome throws on the `localStorage` property itself when site data is blocked.
function resolveStorage(host: StorageHost | null | undefined): Storage | null {
  try {
    return host?.localStorage ?? null
  } catch {
    return null
  }
}

/** This browser's guest name, minted on first visit. Works without storage. */
export function getOrCreateGuestName(
  host: StorageHost | null | undefined = globalThis,
): string {
  const storage = resolveStorage(host)

  const stored = readGuestName(storage)
  if (stored) return stored

  const name = guestNameFromSeed(randomSeed())
  writeGuestName(storage, name)
  return name
}

/** Stores a typed name; returns it sanitized, or null if nothing usable is left. */
export function rememberGuestName(
  name: string,
  host: StorageHost | null | undefined = globalThis,
): string | null {
  const sanitized = sanitizeName(name)
  if (!sanitized) return null

  writeGuestName(resolveStorage(host), sanitized)
  return sanitized
}

function writeGuestName(storage: Storage | null, name: string) {
  try {
    storage?.setItem(GUEST_NAME_STORAGE_KEY, name)
  } catch {
    // Unwritable storage: the name lasts this page load.
  }
}

function readGuestName(storage: Storage | null): string | null {
  try {
    return sanitizeName(storage?.getItem(GUEST_NAME_STORAGE_KEY))
  } catch {
    return null
  }
}
