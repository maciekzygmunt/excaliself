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
