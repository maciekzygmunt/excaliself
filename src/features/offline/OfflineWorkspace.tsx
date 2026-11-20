import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import { ArrowLeft, CloudOff, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { buildInitialSceneData } from "@/features/drawings/scene"
import { useCanvasTheme, useStoredTheme } from "@/hooks/use-theme"
import {
  createLocalDrawing,
  listLocalDrawings,
  offlineAccount,
  readLocalDrawing,
  retryAsCopy,
  subscribeToLocalDrawings,
  supportsOfflineDrawings,
} from "./store"
import { useOfflineSync } from "./sync"
import { type LocalDrawing, localSaveLabel } from "./types"
import { useLocalEditor } from "./use-local-editor"
import "@excalidraw/excalidraw/index.css"

function Editor({
  initial,
  onCopy,
}: {
  initial: LocalDrawing
  onCopy: (id: string) => void
}) {
  const [opening] = useState(initial)
  const local = useLocalEditor(opening)
  const theme = useCanvasTheme()
  const [{ initialData, isDataCorrupt }] = useState(() =>
    buildInitialSceneData(initial.scene),
  )
  const drawing = local.drawing ?? initial
  const status = isDataCorrupt
    ? "This drawing could not be opened"
    : local.failed
      ? "Couldn’t save on this device"
      : local.saving
        ? "Saving on this device…"
        : localSaveLabel(drawing.status)

  useEffect(() => {
    if (drawing.id !== initial.id) onCopy(drawing.id)
  }, [drawing.id, initial.id, onCopy])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-hairline sm:border-l sm:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2">
        <h2 className="max-w-full truncate font-medium">{drawing.name}</h2>
        <span role="status" className="text-sm text-muted-foreground">
          {status}
        </span>
        {drawing.status === "conflict" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void retryAsCopy(drawing)
                .then((copy) => {
                  if (copy) onCopy(copy.id)
                })
                .catch(() => toast.error("Couldn’t save a copy"))
            }}
          >
            Sync as a new drawing
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          theme={theme}
          initialData={{ ...initialData, scrollToContent: true }}
          viewModeEnabled={isDataCorrupt || undefined}
          onChange={
            isDataCorrupt
              ? undefined
              : (elements, appState, files) =>
                  local.onChange({ elements, appState, files })
          }
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

export default function OfflineWorkspace() {
  useStoredTheme()
  const [owner, setOwner] = useState(offlineAccount)
  const [drawings, setDrawings] = useState<{ id: string; name: string }[]>()
  const [current, setCurrent] = useState<LocalDrawing>()
  const supported = supportsOfflineDrawings()
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState(() =>
    new URLSearchParams(window.location.search).get("drawing"),
  )
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  useOfflineSync(owner)

  useEffect(() => {
    const readAccount = () => {
      const next = offlineAccount()
      if (next === owner) return
      setDrawings(undefined)
      setCurrent(undefined)
      setOwner(next)
    }
    window.addEventListener("storage", readAccount)
    return () => window.removeEventListener("storage", readAccount)
  }, [owner])

  useEffect(() => {
    if (!owner || !supported) return
    let active = true
    setUnavailable(false)
    const refresh = () => {
      void listLocalDrawings(owner)
        .then((list) => {
          if (active) setDrawings(list)
        })
        .catch(() => {
          if (active) setUnavailable(true)
        })
    }
    const unsubscribe = subscribeToLocalDrawings(refresh)
    refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }, [owner, supported])

  const select = (id: string) => {
    setSelected(id)
    window.history.replaceState(
      window.history.state,
      "",
      `/offline?drawing=${encodeURIComponent(id)}`,
    )
  }

  useEffect(() => {
    if (!owner || !selected || !supported) return
    let active = true
    void readLocalDrawing(owner, selected)
      .then((drawing) => {
        if (active) setCurrent(drawing)
      })
      .catch(() => {
        if (active) setUnavailable(true)
      })
    return () => {
      active = false
    }
  }, [owner, selected, supported])

  const selectedDrawing =
    current?.owner === owner &&
    current?.id === selected &&
    drawings?.some(({ id }) => id === selected)
      ? current
      : undefined

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <CloudOff aria-hidden="true" className="size-4 text-iris" />
          Offline drawings
        </h1>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<a href="/draw" />}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Excaliself
        </Button>
      </header>
      {!supported || !owner || unavailable ? (
        <p className="p-6 text-sm text-muted-foreground">
          {!supported
            ? "Offline drawings require HTTPS or localhost with device storage enabled."
            : owner
              ? "Offline storage is unavailable in this browser."
              : "Sign in and open Excaliself on this browser to use offline drawings."}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="max-h-[35%] w-full shrink-0 overflow-y-auto p-3 sm:max-h-none sm:w-64">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = name.trim()
                if (!trimmed || creating) return
                setCreating(true)
                void createLocalDrawing(owner, trimmed)
                  .then((drawing) => {
                    select(drawing.id)
                    setName("")
                  })
                  .catch(() =>
                    toast.error("Couldn’t create a drawing on this device"),
                  )
                  .finally(() => setCreating(false))
              }}
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={1000}
                aria-label="New drawing name"
                placeholder="New drawing name"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Create drawing"
                disabled={!name.trim() || creating}
              >
                <Plus aria-hidden="true" />
              </Button>
            </form>
            <nav
              aria-label="Drawings on this device"
              className="mt-3 flex flex-col gap-1"
            >
              {drawings?.map((drawing) => (
                <Button
                  key={drawing.id}
                  type="button"
                  variant={drawing.id === selected ? "secondary" : "ghost"}
                  aria-current={drawing.id === selected ? "page" : undefined}
                  className="justify-start"
                  onClick={() => select(drawing.id)}
                >
                  <span className="truncate">{drawing.name}</span>
                </Button>
              ))}
            </nav>
          </aside>
          {selectedDrawing ? (
            <Editor
              key={selectedDrawing.id}
              initial={selectedDrawing}
              onCopy={select}
            />
          ) : (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {!drawings
                ? "Reading drawings on this device…"
                : selected
                  ? "This drawing isn’t available on this device."
                  : "Open a drawing from this device or create one."}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
