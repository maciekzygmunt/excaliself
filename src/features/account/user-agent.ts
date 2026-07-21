// Session rows label devices as "Browser on OS" (spec §5.12). Order matters
// within each list: Chromium UAs also claim Safari, Edge/Opera also claim
// Chrome, and Android UAs also claim Linux — the more specific token wins.
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bSafari\//, "Safari"],
]

const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bLinux\b|\bX11\b/, "Linux"],
]

export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? ""
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Unknown device"
}
