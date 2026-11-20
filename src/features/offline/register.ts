export function prepareOfflineApp() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  void navigator.serviceWorker.register("/offline-worker.js").catch(() => {})
}
