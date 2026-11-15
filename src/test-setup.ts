// jsdom has no IntersectionObserver. This one reports every element in view
// at once, so content that loads on sight (gallery previews) loads in tests.
class InViewObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

globalThis.IntersectionObserver ??=
  InViewObserver as unknown as typeof IntersectionObserver

// Vitest sets BASE_URL to "/", which is not a URL.
if (process.env.BASE_URL === "/") {
  delete process.env.BASE_URL
}
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test"
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-00"
