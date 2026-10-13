// Forwarded headers are trusted only from a private-address peer (a reverse
// proxy); a public peer could rotate them to mint fresh rate-limit budgets.

const UNKNOWN_KEY = "unknown"

/** The peer address srvx sets on a `Request`; absent under vite dev. */
export function socketIpOf(request: Request): string | null {
  return (request as Request & { ip?: string }).ip ?? null
}

const address = (value: string | null | undefined) => value?.trim() || null

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

// Proxies append the peer they saw, so the rightmost hop is the trusted one.
function lastForwardedHop(value: string | null): string | null {
  const hops = (value ?? "").split(",").map(address).filter(Boolean)
  return hops.at(-1) ?? null
}

export function clientIpKey(input: {
  headers: Headers
  socketIp?: string | null
}): string {
  const { headers, socketIp } = input
  const peer = address(socketIp)
  if (peer && !isPrivateAddress(peer)) return peer

  return (
    lastForwardedHop(headers.get("x-forwarded-for")) ??
    address(headers.get("x-real-ip")) ??
    peer ??
    UNKNOWN_KEY
  )
}
