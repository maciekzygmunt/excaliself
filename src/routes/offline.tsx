import { createFileRoute } from "@tanstack/react-router"
import { createClientOnlyFn } from "@tanstack/react-start"
import { lazy, Suspense } from "react"

const OfflineWorkspace = lazy(
  createClientOnlyFn(() => import("@/features/offline/OfflineWorkspace")),
)

export const Route = createFileRoute("/offline")({
  ssr: false,
  component: () => (
    <Suspense
      fallback={
        <p className="p-6 text-sm" role="status">
          Opening offline workspace…
        </p>
      }
    >
      <OfflineWorkspace />
    </Suspense>
  ),
})
