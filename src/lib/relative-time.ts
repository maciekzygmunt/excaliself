import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

// One coarse "how long ago" vocabulary shared by gallery cards and session
// rows, so timestamps read identically everywhere.
export function formatAgo(at: Date | string): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return m.time_just_now()
  const locale = getLocale()
  // English "narrow" reads "5m ago"; in French it is "-5 min", so the other
  // languages take "short" ("il y a 5 min").
  const rtf = new Intl.RelativeTimeFormat(locale, {
    style: locale === "en" ? "narrow" : "short",
  })
  if (minutes < 60) return rtf.format(-minutes, "minute")
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, "hour")
  const days = Math.floor(hours / 24)
  if (days < 30) return rtf.format(-days, "day")
  // 30-day months drift past the calendar: days 360-364 are under a year but
  // floor to 12 — cap at 11mo so it never reads "12mo ago" or "0y ago"
  if (days < 365)
    return rtf.format(-Math.min(Math.floor(days / 30), 11), "month")
  return rtf.format(-Math.floor(days / 365), "year")
}
