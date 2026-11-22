import { createFileRoute } from "@tanstack/react-router"
import { createClientOnlyFn } from "@tanstack/react-start"
import { lazy, Suspense } from "react"
import { m } from "@/paraglide/messages"

const OfflineWorkspace = lazy(
  createClientOnlyFn(() => import("@/features/offline/OfflineWorkspace")),
)

export const Route = createFileRoute("/offline")({
  ssr: false,
  component: () => (
    <Suspense
      fallback={
        <p className="p-6 text-sm" role="status">
          {m.offline_opening()}
        </p>
      }
    >
      <OfflineWorkspace />
    </Suspense>
  ),
})
