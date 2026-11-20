/* global self, caches, OFFLINE_CACHE, OFFLINE_ASSETS */

// The build injects a cache name and a list of public, fingerprinted assets.
const SHELL = "/offline"
const assets = new Set(OFFLINE_ASSETS)

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      const shell = await fetch(SHELL, { credentials: "omit", cache: "reload" })
      if (!shell.ok || shell.redirected)
        throw new Error("Offline workspace unavailable")
      await Promise.all([cache.put(SHELL, shell), cache.addAll(OFFLINE_ASSETS)])
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("excaliself-offline-") && name !== OFFLINE_CACHE)
          await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    if (url.pathname === SHELL) {
      event.respondWith(
        caches
          .open(OFFLINE_CACHE)
          .then(async (cache) => (await cache.match(SHELL)) ?? fetch(request)),
      )
      return
    }

    const drawing = /^\/draw\/([^/]+)$/.exec(url.pathname)
    if (
      !drawing &&
      !/^\/(?:draw\/?|drawings|trash|settings(?:\/.*)?|folder\/[^/]+)?$/.test(
        url.pathname,
      )
    )
      return
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request, {
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
          })
          if (response.status < 500) return response
        } catch {
          // The instance may be unreachable even when the browser is online.
        }
        const target = new URL(SHELL, url)
        if (drawing) target.search = `?drawing=${drawing[1]}`
        return Response.redirect(target)
      })(),
    )
  } else if (assets.has(url.pathname)) {
    event.respondWith(
      caches
        .open(OFFLINE_CACHE)
        .then(
          async (cache) => (await cache.match(url.pathname)) ?? fetch(request),
        ),
    )
  }
})
