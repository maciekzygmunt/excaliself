import { onlineManager, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { createClientOnlyFn } from "@tanstack/react-start"
import { lazy, Suspense, useEffect, useState } from "react"
import { toast } from "sonner"
import { Mark } from "@/components/identity"
import { currentUserQueryOptions } from "@/features/account/queries"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import {
  deviceDrawingRecord,
  supportsDeviceDrawings,
} from "@/features/offline/store"
import { syncDeviceDrawingNow, toastCopied } from "@/features/offline/sync"
import { useDocumentTitle } from "@/lib/document-title"
import { m } from "@/paraglide/messages"
import { DrawingPaletteContext } from "../-components/DrawingPaletteContext"
import { TrashedDrawingBanner } from "../-components/TrashedDrawingBanner"

// Client-only so the server bundle never includes @excalidraw/excalidraw
const DrawingCanvas = lazy(
  createClientOnlyFn(() => import("../-components/DrawingCanvas")),
)

// The branded canvas loader (spec §4.3): the iris spark mark alone, gently
// pulsing — no text, static under reduced motion.
const LoadingState = () => (
  <div
    role="status"
    aria-label={m.drawing_loading()}
    className="absolute inset-0 z-10 flex items-center justify-center bg-card"
  >
    <Mark className="h-8 w-8 animate-pulse text-iris motion-reduce:animate-none" />
  </div>
)

export const Route = createFileRoute("/_app/draw/$id")({
  ssr: false,
  // With offline drawings on, the device sync below must finish before each
  // open. A hover preload or a kept match would let the canvas open first,
  // over edits this device or another tab still holds.
  ...(supportsDeviceDrawings() && { preload: false, gcTime: 0 }),
  loader: async ({ params, context, preload }) => {
    const { queryClient } = context
    const detail = drawingQueryOptions(params.id)
    // Edits this device kept go up first, so the canvas opens on them. If
    // they can't, the offline page opens this device's version.
    const offlinePage = redirect({
      href: `/offline?drawing=${encodeURIComponent(params.id)}`,
      reloadDocument: true,
    })
    let owner: string | undefined
    let copied: { name: string; copyName: string } | undefined
    if (supportsDeviceDrawings()) {
      owner = (await queryClient.ensureQueryData(currentUserQueryOptions())).id
      const outcome = await syncDeviceDrawingNow(owner, params.id, 3000)
      if (outcome.status === "failed") throw offlinePage
      // Changed, or another tab holds edits the server may lack: a cached
      // scene can't be trusted. Unreachable, the fetch opens the device copy.
      if (outcome.status !== "clean")
        queryClient.removeQueries({ queryKey: detail.queryKey, exact: true })
      if (outcome.status === "copied") copied = outcome
    }
    // Unreachable and not cached: open the copy kept on this device, if any.
    // Offline, the fetch would wait for the network instead of failing.
    const keptHere = () =>
      owner
        ? deviceDrawingRecord(owner, params.id).catch(() => undefined)
        : undefined
    // Another tab may have uploaded this device's edits: a cached scene, or a
    // cached "not found", that differs from the clean copy is stale.
    const cached = queryClient.getQueryData(detail.queryKey)
    if (cached !== undefined) {
      const kept = await keptHere()
      if (kept?.status === "clean" && kept.data !== cached?.data)
        queryClient.removeQueries({ queryKey: detail.queryKey, exact: true })
    }
    if (
      !onlineManager.isOnline() &&
      queryClient.getQueryData(detail.queryKey) === undefined &&
      (await keptHere())
    )
      throw offlinePage
    const drawing = await queryClient
      .ensureQueryData(detail)
      .catch(async (error) => {
        throw (await keptHere()) ? offlinePage : error
      })
    // The server returns null for hard-deleted drawings and drawings that
    // aren't yours (deliberately indistinguishable) — land on Home, not a
    // dead end. Trashed drawings load and render read-only (spec §5.11).
    // ssr is off, so this loader (and the toast) always runs on the client.
    if (!drawing) {
      // Hover-intent preloads swallow the redirect, so they must not toast.
      if (!preload)
        toast.error(m.drawing_not_found(), { id: "drawing-not-found" })
      throw redirect({ to: "/draw" })
    }
    return { copied }
  },
  component: DrawingPage,
  pendingComponent: LoadingState,
})

function DrawingPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: drawing } = useQuery(drawingQueryOptions(id))
  const { copied } = Route.useLoaderData()

  // Deferred: on a fresh page load the Toaster, a later sibling, subscribes
  // after this effect runs.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => toastCopied(copied))
    return () => clearTimeout(timer)
  }, [copied])

  // Title from the sidebar list cache, not the detail query: renames patch
  // the list optimistically, so the tab tracks them without waiting for the
  // server round-trip. Trashed drawings aren't in the live list — their name
  // comes from the detail query instead (no renaming in the trash anyway).
  const { data: drawingName } = useQuery({
    ...drawingsQueryOptions(),
    select: (drawings) => drawings.find((d) => d.id === id)?.name,
  })
  useDocumentTitle(drawingName ?? drawing?.name)

  // The loader only guards fresh loads: within staleTime it returns the
  // cached drawing without refetching, and the mount refetch that follows can
  // discover the drawing was hard-deleted from another session. React to the
  // query turning null (undefined means still loading) the same way the
  // loader does — Home plus a toast, never a blank canvas on a dead URL.
  const isGone = drawing === null
  useEffect(() => {
    if (!isGone) return
    toast.error(m.drawing_not_found(), { id: "drawing-not-found" })
    navigate({ to: "/draw", replace: true })
  }, [isGone, navigate])

  // Who trashed the drawing while this tab was in its Room, from the close.
  const [trashedBy, setTrashedBy] = useState<{
    drawingId: string
    name: string | null
  } | null>(null)

  if (isGone) return <LoadingState />

  // Trashed drawings render read-only under a purge banner (spec §5.11).
  // A trashing/restore from any surface refetches the detail query, so this
  // flips live without a reload.
  const trashedAt = drawing?.deletedAt ?? null
  const isTrashed = trashedAt != null

  // Remount on id change so per-document state (auto-save dedup, edits in
  // progress, Excalidraw scene) is fully reset without manual cleanup — and
  // on the trashed flag so a restore lands on a freshly editable canvas
  // instead of toggling Excalidraw's view mode in place.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawingPaletteContext drawingId={id} />
      {trashedAt && drawing && (
        <TrashedDrawingBanner
          drawing={{ ...drawing, deletedAt: trashedAt }}
          trashedBy={trashedBy?.drawingId === id ? trashedBy.name : null}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<LoadingState />}>
          <DrawingCanvas
            key={`${id}:${isTrashed}`}
            drawingId={id}
            readOnly={isTrashed}
            onLinkDead={(name) => setTrashedBy({ drawingId: id, name })}
          />
        </Suspense>
      </div>
    </div>
  )
}
