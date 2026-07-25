/**
 * The guest's display name, kept only in the browser (spec §1.3, §4.4): no
 * account, no cookie, no server-side guest record. Generated once and
 * remembered, so reconnecting — or opening a second shared drawing — keeps
 * the same name behind a fresh connection id.
 */

import { guestNameFromSeed } from "./identity"
import { sanitizeName } from "./protocol"

export const GUEST_NAME_STORAGE_KEY = "excaliself:guest-name"

/** Whatever holds a `localStorage` — the window, in a browser. */
type StorageHost = { localStorage?: Storage }

function randomSeed(): number {
  return Math.floor(Math.random() * 0xff_ff_ff_ff)
}

/**
 * Reading `window.localStorage` is itself throwable: Chrome raises a
 * SecurityError on the *property* when site data is blocked. So the lookup
 * happens here, inside the guard, rather than at the call site — where the
 * throw would escape into a render.
 */
function resolveStorage(host: StorageHost | null | undefined): Storage | null {
  try {
    return host?.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The name this browser goes by, minting and storing one on first visit.
 * Every access to storage is guarded — the property lookup, the read, and the
 * write — so a guest whose storage is unavailable still gets a working name;
 * it just lives for this page load.
 */
export function getOrCreateGuestName(
  host: StorageHost | null | undefined = globalThis,
): string {
  const storage = resolveStorage(host)

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

function readGuestName(storage: Storage | null): string | null {
  try {
    return sanitizeName(storage?.getItem(GUEST_NAME_STORAGE_KEY))
  } catch {
    return null
  }
}
