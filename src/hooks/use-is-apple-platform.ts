import { useSyncExternalStore } from "react"

const subscribeNever = () => () => {}

function readIsApplePlatform(): boolean {
  const platform =
    // biome-ignore lint/suspicious/noExplicitAny: userAgentData is not yet in lib.dom
    (navigator as any).userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * Whether shortcut hints should render the ⌘ glyph (Apple) or "Ctrl"
 * (everything else). The handlers accept both metaKey and ctrlKey, so this
 * only affects the label. SSR renders the Apple form; the client corrects
 * it right after hydration.
 */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(subscribeNever, readIsApplePlatform, () => true)
}
