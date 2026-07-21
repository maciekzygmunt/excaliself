// One coarse "how long ago" vocabulary shared by gallery cards and session
// rows, so timestamps read identically everywhere.
export function formatAgo(at: Date | string): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  // 30-day months drift past the calendar: days 360-364 are under a year but
  // floor to 12 — cap at 11mo so it never reads "12mo ago" or "0y ago"
  if (days < 365) return `${Math.min(Math.floor(days / 30), 11)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
