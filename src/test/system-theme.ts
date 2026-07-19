import { vi } from "vitest"

/**
 * jsdom has no matchMedia; the auth shell reads it to follow the system
 * theme. Stub before render, unstub via vi.unstubAllGlobals() in afterEach.
 */
export function stubSystemTheme(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}
