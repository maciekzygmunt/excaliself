import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { CurrentUser } from "@/features/account/queries"
import { setDeviceDrawingsEnabled } from "@/features/offline/store"
import { drainDeviceDrawings } from "@/features/offline/sync"
import {
  useCanKeepOffline,
  useOfflineEnabled,
} from "@/features/offline/use-offline-enabled"
import { m } from "@/paraglide/messages"

// Offline drawings are opt-in per browser. The switch reloads the page, so
// every part of the app reads the same answer.
export function OfflineSection({ user }: { user: CurrentUser }) {
  const on = useOfflineEnabled()
  const possible = useCanKeepOffline()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      if (on) {
        // Unsent edits go up first; if they can't, it stays on.
        const drained = await drainDeviceDrawings(user.id)
        if (drained !== "done") {
          toast.error(
            drained === "open"
              ? m.settings_offline_open()
              : m.settings_offline_pending(),
          )
          return
        }
        const worker = await navigator.serviceWorker?.getRegistration()
        await worker?.unregister()
        for (const name of await caches.keys())
          if (name.startsWith("excaliself-offline-")) await caches.delete(name)
      }
      setDeviceDrawingsEnabled(!on)
      window.location.reload()
    } catch {
      toast.error(m.settings_offline_failed())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-foreground">
        {m.settings_offline_title()}
      </h2>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {m.settings_offline_label()}
          </p>
          <p className="text-xs text-muted-foreground">
            {possible ? m.settings_offline_hint() : m.offline_needs_https()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={!possible || busy}
          onClick={toggle}
        >
          {on ? m.settings_offline_turn_off() : m.settings_offline_turn_on()}
        </Button>
      </div>
    </section>
  )
}
