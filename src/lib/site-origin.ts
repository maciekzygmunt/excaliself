/**
 * The instance's public origin, for building absolute URLs (og:image must
 * resolve on whatever origin a self-hosted instance runs at). BASE_URL wins
 * when configured; otherwise derive from the reverse proxy's forwarded
 * headers, falling back to the request itself.
 */
export function resolveOrigin({
  baseUrl,
  headers,
  requestUrl,
}: {
  baseUrl?: string
  headers: Headers
  requestUrl: string
}): string {
  if (baseUrl) return new URL(baseUrl).origin
  const url = new URL(requestUrl)
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? url.host
  // Each proxy hop may append its own value ("https, http") — the first
  // entry is the client-facing protocol.
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    url.protocol.replace(":", "")
  return `${proto}://${host}`
}
