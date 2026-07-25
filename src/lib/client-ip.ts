/**
 * The key an abuse limiter counts against: the visitor's IP as best this
 * process can know it (canvas sharing spec §4.5). Pure, because both callers
 * hand it a different kind of request — a server function's headers, and the
 * websocket upgrade's raw Request.
 *
 * Deployment assumption: at most one trusted reverse proxy (Coolify's
 * Traefik, per §6). A proxy *appends* the peer it saw to any `x-forwarded-for`
 * that arrived, so the rightmost entry is the one it vouched for and anything
 * a client sends itself is pushed to the left of it. Exposed directly with no
 * proxy in front, the header is unverifiable either way and the socket
 * address takes over.
 */

/** Every request whose address can't be read shares this one bucket. */
const UNKNOWN_KEY = "unknown"

function lastForwardedHop(value: string | null): string | null {
  if (!value) return null
  const hops = value
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean)
  return hops.at(-1) ?? null
}

export function clientIpKey(input: {
  headers: Headers
  /** The peer address of the connection itself, when the runtime exposes it. */
  socketIp?: string | null
}): string {
  const { headers, socketIp } = input
  return (
    lastForwardedHop(headers.get("x-forwarded-for")) ??
    headers.get("x-real-ip")?.trim() ??
    socketIp?.trim() ??
    UNKNOWN_KEY
  )
}
