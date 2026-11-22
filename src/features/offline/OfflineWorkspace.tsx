import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { ArrowLeft, CloudOff, Plus } from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  markImageStatus,
  toastImageTooLarge,
} from "@/features/collab/use-room-files"
import { MAX_NAME_LENGTH } from "@/features/drawings/list-columns"
import {
  buildInitialSceneData,
  selectOversizedImages,
} from "@/features/drawings/scene"
import { useCanvasTheme, useStoredTheme } from "@/hooks/use-theme"
import { m } from "@/paraglide/messages"
import {
  canKeepDeviceDrawings,
  createDeviceDrawing,
  deviceAccount,
  listDeviceDrawings,
  readDeviceDrawing,
  subscribeToDeviceDrawings,
  supportsDeviceDrawings,
} from "./store"
import { holdDeviceDrawing, useDeviceSync } from "./sync"
import { useDeviceDraft } from "./use-device-draft"
import "@excalidraw/excalidraw/index.css"

type Opened = NonNullable<Awaited<ReturnType<typeof readDeviceDrawing>>>

type Flush = RefObject<(() => Promise<boolean>) | null>

/** Holds the drawing first, so no sync moves it while it opens. */
function Editor({
  owner,
  id,
  flushRef,
}: {
  owner: string
  id: string
  flushRef: Flush
}) {
  const [drawing, setDrawing] = useState<Opened | null>()
  useEffect(() => {
    const { granted, release } = holdDeviceDrawing(owner, id)
    let active = true
    void granted
      .then(() => readDeviceDrawing(owner, id))
      .then(
        (found) => active && setDrawing(found ?? null),
        () => active && setDrawing(null),
      )
    // Held until the last draft lands, so no sync moves the drawing first.
    return () => {
      active = false
      void (flushRef.current?.() ?? Promise.resolve()).finally(release)
    }
  }, [owner, id, flushRef])

  if (drawing === undefined)
    return <Notice>{m.offline_reading_drawing()}</Notice>
  if (drawing === null) return <Notice>{m.offline_not_here()}</Notice>
  return <Canvas owner={owner} drawing={drawing} flushRef={flushRef} />
}

function Canvas({
  owner,
  drawing,
  flushRef,
}: {
  owner: string
  drawing: Opened
  flushRef: Flush
}) {
  const theme = useCanvasTheme()
  const [{ initialData, isDataCorrupt }] = useState(() =>
    buildInitialSceneData(drawing),
  )
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [stored] = useState(
    () => new Set(drawing.files.map((file) => file.fileId)),
  )
  const draft = useDeviceDraft(isDataCorrupt ? null : owner, drawing.id)
  const { base, writer } = draft
  useEffect(() => {
    writer.current = crypto.randomUUID()
    base.current = drawing.baseRevision
  }, [base, writer, drawing.baseRevision])
  useEffect(() => {
    flushRef.current = draft.flush
  }, [flushRef, draft.flush])
  const status = isDataCorrupt
    ? m.offline_status_corrupt()
    : draft.state === "failed"
      ? m.offline_status_write_failed()
      : draft.state === "written" || drawing.status === "pending"
        ? m.offline_status_waiting()
        : m.offline_status_synced()

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-hairline sm:border-l sm:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2">
        <h2 className="max-w-full truncate font-medium">{drawing.name}</h2>
        <span role="status" className="text-sm text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          theme={theme}
          initialData={{ ...initialData, scrollToContent: true }}
          viewModeEnabled={isDataCorrupt || undefined}
          excalidrawAPI={setApi}
          onChange={(elements, appState, files) => {
            // The server would refuse these, so flag them as the online
            // editor does.
            if (api)
              for (const fileId of selectOversizedImages(
                elements,
                files,
                stored,
              )) {
                markImageStatus(api, fileId, "error")
                toastImageTooLarge()
              }
            draft.onChange({ elements, appState, files })
          }}
          UIOptions={{
            canvasActions: { loadScene: false, toggleTheme: false },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    </section>
  )
}

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p role="status" className="p-6 text-sm text-muted-foreground">
    {children}
  </p>
)

/**
 * The page the service worker opens when the instance can't be reached:
 * private drawings kept on this device, and new ones. Server-free.
 */
export default function OfflineWorkspace() {
  useStoredTheme()
  const supported = supportsDeviceDrawings()
  const [owner, setOwner] = useState(deviceAccount)
  const [drawings, setDrawings] = useState<{ id: string; name: string }[]>()
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState(() =>
    new URLSearchParams(window.location.search).get("drawing"),
  )
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const flushEditor = useRef<(() => Promise<boolean>) | null>(null)
  useDeviceSync(supported ? owner : null)

  // Signing in or out in another tab switches whose drawings these are.
  useEffect(() => {
    const readAccount = () => setOwner(deviceAccount())
    window.addEventListener("storage", readAccount)
    return () => window.removeEventListener("storage", readAccount)
  }, [])

  useEffect(() => {
    if (!owner || !supported) return
    let active = true
    setDrawings(undefined)
    const refresh = () => {
      listDeviceDrawings(owner).then(
        (list) => active && setDrawings(list),
        () => active && setUnavailable(true),
      )
    }
    const unsubscribe = subscribeToDeviceDrawings(refresh)
    refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }, [owner, supported])

  const open = (id: string) => {
    setSelected(id)
    window.history.replaceState(
      window.history.state,
      "",
      `/offline?drawing=${encodeURIComponent(id)}`,
    )
  }

  // The open drawing's last edit lands first. If it can't, stay on it.
  const select = async (id: string) => {
    if (flushEditor.current && !(await flushEditor.current())) {
      toast.error(m.offline_switch_failed_title(), {
        id: "offline-switch",
        description: m.offline_switch_failed_description(),
        action: { label: m.offline_switch_anyway(), onClick: () => open(id) },
      })
      return
    }
    open(id)
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!owner || !trimmed || creating) return
    setCreating(true)
    createDeviceDrawing(owner, trimmed)
      .then(async (drawing) => {
        setName("")
        await select(drawing.id)
      })
      .catch(() => toast.error(m.offline_create_failed()))
      .finally(() => setCreating(false))
  }

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <CloudOff aria-hidden="true" className="size-4 text-iris" />
          {m.offline_title()}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          // Opening the drawing online uploads its edits first. A document
          // navigation skips unmount, so the last edit is written here.
          render={
            <a
              href={
                selected ? `/draw/${encodeURIComponent(selected)}` : "/draw"
              }
              onClick={(event) => {
                const flush = flushEditor.current
                if (!flush) return
                event.preventDefault()
                const { href } = event.currentTarget
                void flush().then((ok) => {
                  if (ok) window.location.assign(href)
                })
              }}
            />
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {m.offline_back()}
        </Button>
      </header>
      {!supported || !owner || unavailable ? (
        <Notice>
          {!canKeepDeviceDrawings()
            ? m.offline_needs_https()
            : !supported
              ? m.offline_turned_off()
              : owner
                ? m.offline_storage_unavailable()
                : m.offline_sign_in_first()}
        </Notice>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="max-h-[35%] w-full shrink-0 overflow-y-auto p-3 sm:max-h-none sm:w-64">
            <form className="flex gap-2" onSubmit={create}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_NAME_LENGTH}
                aria-label={m.offline_new_name()}
                placeholder={m.offline_new_name()}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={m.offline_create()}
                disabled={!name.trim() || creating}
              >
                <Plus aria-hidden="true" />
              </Button>
            </form>
            <nav
              aria-label={m.offline_list_label()}
              className="mt-3 flex flex-col gap-1"
            >
              {drawings?.map((drawing) => (
                <Button
                  key={drawing.id}
                  type="button"
                  variant={drawing.id === selected ? "secondary" : "ghost"}
                  aria-current={drawing.id === selected ? "page" : undefined}
                  className="justify-start"
                  onClick={() => void select(drawing.id)}
                >
                  <span className="truncate">{drawing.name}</span>
                </Button>
              ))}
            </nav>
          </aside>
          {selected ? (
            <Editor
              key={selected}
              owner={owner}
              id={selected}
              flushRef={flushEditor}
            />
          ) : (
            <Notice>
              {drawings ? m.offline_pick() : m.offline_reading_list()}
            </Notice>
          )}
        </div>
      )}
    </main>
  )
}
