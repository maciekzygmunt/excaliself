/**
 * One instance per process. The websocket route and the server functions are
 * separate bundles, so a plain module-level `const` would exist once per bundle.
 */
export function processSingleton<T>(key: string, create: () => T): T {
  const host = globalThis as Record<symbol, T | undefined>
  const symbol = Symbol.for(`excaliself.${key}`)
  host[symbol] ??= create()
  return host[symbol]
}
