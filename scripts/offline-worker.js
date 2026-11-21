/* global self, caches, OFFLINE_VERSION, OFFLINE_ASSETS */

// The build prepends OFFLINE_VERSION and OFFLINE_ASSETS: the offline page's
// own chunks. Each release installs a fresh cache. Other fingerprinted
// assets (fonts, locales) are cached as the app uses them.
const CACHE = `excaliself-offline-${OFFLINE_VERSION}`
const SHELL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const shell = await fetch(SHELL, { credentials: "omit", cache: "reload" })
      if (!shell.ok || shell.redirected)
        throw new Error("Offline page unavailable")
      // The entry scripts and styles the page itself links.
      const linked = (await shell.clone().text()).match(
        /\/assets\/[^"'\s)]+\.(?:js|css)\b/g,
      )
      await cache.put(SHELL, shell)
      await cache.addAll([...new Set([...(linked ?? []), ...OFFLINE_ASSETS])])
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("excaliself-offline-") && name !== CACHE)
          await caches.delete(name)
      await self.clients.claim()
    })(),
  )
})

const offlinePage = (url) => {
  const drawing = /^\/draw\/([^/]+)$/.exec(url.pathname)
  const target = new URL(SHELL, url)
  if (drawing)
    target.searchParams.set("drawing", decodeURIComponent(drawing[1]))
  return Response.redirect(target)
}

const cached = async (request) => {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

// What a proxy answers for an origin it can't reach. 521-524: Cloudflare.
const unreachable = (status) =>
  (status >= 502 && status <= 504) || (status >= 521 && status <= 524)

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cached(request))
  } else if (request.mode === "navigate" && url.pathname === SHELL) {
    event.respondWith(cached(SHELL))
  } else if (request.mode === "navigate" && !url.pathname.startsWith("/api/")) {
    // Network first. Unreachable, or its proxy says so: the offline page.
    event.respondWith(
      fetch(request, { signal: AbortSignal.timeout(10_000) })
        .then((response) =>
          unreachable(response.status) ? offlinePage(url) : response,
        )
        .catch(() => offlinePage(url)),
    )
  }
})
