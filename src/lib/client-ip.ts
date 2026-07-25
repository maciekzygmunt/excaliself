/**
 * The key an abuse limiter counts against: the visitor's IP as best this
 * process can know it (canvas sharing spec §4.5). Pure, because both callers
 * hand it a different kind of request — a server function's headers, and the
 * websocket upgrade's raw Request.
 *
 * A forwarded header is only worth reading when the connection it arrived on
 * came from a proxy, which here means a peer on a loopback or private address
 * — the shape of every reverse-proxy deployment (Coolify's Traefik, §6). The
 * documented docker-compose publishes port 3000 straight out, and there a
 * visitor's own `x-forwarded-for` is just a string it typed: trusting it would
 * let one client mint a fresh budget per request by rotating the value, which
 * is the whole limit gone.
 *
 * Where a proxy is trusted, the *rightmost* hop is the one it vouched for —
 * proxies append the peer they saw, so anything a client sent itself is pushed
 * to the left of its real address.
 *
 * A runtime that exposes no peer address at all leaves nothing to test the
 * headers against, so they are read: that is the vite dev server, where the
 * only peer is the developer. Both surfaces of the built server do report one
 * (checked in `.output`), which is the deployment the rule above is for.
 */

/** Every request whose address can't be read shares this one bucket. */
const UNKNOWN_KEY = "unknown"

/** Blank is as good as absent — a header a proxy set to "" names nobody. */
const address = (value: string | null | undefined) => value?.trim() || null

/**
 * Loopback, RFC1918, link-local, and their IPv6 counterparts (including the
 * `::ffff:` mapped form node reports for IPv4 peers on a dual-stack socket).
 * A peer inside one of these is infrastructure, not a visitor.
 */
function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^::ffff:/, "")
  if (value === "::1" || value === "localhost") return true
  if (/^127\./.test(value)) return true
  if (/^10\./.test(value)) return true
  if (/^192\.168\./.test(value)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true
  if (/^169\.254\./.test(value)) return true
  // fc00::/7 (unique local) and fe80::/10 (link local).
  return /^f[cd]/.test(value) || /^fe[89ab]/.test(value)
}

function lastForwardedHop(value: string | null): string | null {
  const hops = (value ?? "").split(",").map(address).filter(Boolean)
  return hops.at(-1) ?? null
}

export function clientIpKey(input: {
  headers: Headers
  /** The peer address of the connection itself, when the runtime exposes it. */
  socketIp?: string | null
}): string {
  const { headers, socketIp } = input
  const peer = address(socketIp)
  // A public peer is the visitor itself, talking to us with nothing in
  // between: its own forwarding headers prove nothing and are ignored.
  if (peer && !isPrivateAddress(peer)) return peer

  return (
    lastForwardedHop(headers.get("x-forwarded-for")) ??
    address(headers.get("x-real-ip")) ??
    peer ??
    UNKNOWN_KEY
  )
}
