// Every signed-in tab's lists socket, told when drawings or folders change.
// In-memory, so the app stays single-replica.

import { processSingleton } from "@/lib/process-singleton"
import { registerShutdownFlush } from "@/lib/socket/shutdown"

type Listener = { notify: () => void; close: () => void }

export function createListUpdateHub() {
  const listeners = new Set<Listener>()
  let closing = false
  return {
    /** Returns the unsubscribe. */
    add(listener: Listener): () => void {
      listeners.add(listener)
      // An upgrade still awaiting its session can open after closeAll.
      if (closing) listener.close()
      return () => listeners.delete(listener)
    },

    /**
     * Reaches every tab, Private changes too: the frame carries no data, and
     * each tab refetches under its own access rule.
     */
    notify() {
      for (const listener of listeners) listener.notify()
    },

    /** Hangs up every tab, so open sockets don't hold a stopping server alive. */
    closeAll() {
      closing = true
      for (const listener of listeners) listener.close()
    },
  }
}

/** One per process: server functions and the socket are separate bundles. */
export const listUpdates = processSingleton("list-updates", () => {
  const hub = createListUpdateHub()
  registerShutdownFlush(async () => hub.closeAll())
  return hub
})
