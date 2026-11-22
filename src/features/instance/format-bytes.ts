import { getLocale } from "@/paraglide/runtime"

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const

export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  // The number takes the language's decimal sign ("1,5 MB" in German).
  const rounded = new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 1,
  }).format(value)
  return `${rounded} ${UNITS[unit]}`
}
