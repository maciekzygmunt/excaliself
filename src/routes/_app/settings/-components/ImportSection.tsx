import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Space } from "@/db/schema"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { PRIVATE_COLLECTION } from "@/features/excalidraw-plus/api"
import {
  importExcalidrawPlusScene,
  type ScannedScene,
  scanExcalidrawPlus,
} from "@/features/excalidraw-plus/server"
import { foldersQueryOptions } from "@/features/folders/queries"

const KEY_DOCS_URL = "https://plus.excalidraw.com/docs/api/authentication"

const SPACE_LABELS: Record<Space, string> = { team: "Team", private: "Private" }

type Scan = Awaited<ReturnType<typeof scanExcalidrawPlus>>

type Run = {
  done: number
  total: number
  current?: string
  imported: number
  skippedImages: number
  failures: { name: string; message: string }[]
  stopped: boolean
  finished: boolean
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong"

// Brings a member's Excalidraw+ scenes over: scan with an API key, then import
// one scene per request so progress shows and one bad scene can't sink the
// rest. The key lives only in this component's state.
export function ImportSection() {
  const queryClient = useQueryClient()
  const { data: user } = useQuery(currentUserQueryOptions())
  const [apiKey, setApiKey] = useState("")
  const [scan, setScan] = useState<Scan>()
  const [scanError, setScanError] = useState<string>()
  const [scanning, setScanning] = useState(false)
  const [sharedSpace, setSharedSpace] = useState<Space>("team")
  const [run, setRun] = useState<Run>()
  const stopRequested = useRef(false)

  const teamEnabled = user?.teamEnabled ?? false
  const toImport = scan?.scenes.filter((scene) => !scene.imported) ?? []
  const running = run !== undefined && !run.finished

  async function findScenes(event: React.FormEvent) {
    event.preventDefault()
    if (!apiKey.trim()) return
    setScanning(true)
    setScanError(undefined)
    setRun(undefined)
    try {
      setScan(await scanExcalidrawPlus({ data: { apiKey } }))
    } catch (error) {
      setScanError(errorMessage(error))
    } finally {
      setScanning(false)
    }
  }

  async function importAll(scenes: ScannedScene[]) {
    stopRequested.current = false
    let state: Run = {
      done: 0,
      total: scenes.length,
      imported: 0,
      skippedImages: 0,
      failures: [],
      stopped: false,
      finished: false,
    }
    const update = (next: Partial<Run>) => {
      state = { ...state, ...next }
      setRun(state)
    }
    update({})

    for (const scene of scenes) {
      if (stopRequested.current) {
        update({ stopped: true })
        break
      }
      update({ current: scene.name || "Untitled" })
      try {
        const result = await importExcalidrawPlusScene({
          data: {
            apiKey,
            scene: {
              id: scene.id,
              name: scene.name,
              created: scene.created,
              updated: scene.updated,
              pinned: scene.pinned,
              collection: scene.collection,
            },
            sharedSpace: teamEnabled ? sharedSpace : "private",
          },
        })
        if (result.status === "imported")
          update({
            imported: state.imported + 1,
            skippedImages: state.skippedImages + result.skippedImages,
          })
      } catch (error) {
        const message = errorMessage(error)
        update({
          failures: [
            ...state.failures,
            { name: scene.name || "Untitled", message },
          ],
        })
        // A rejected key fails every scene the same way.
        if (message.includes("didn't accept this key")) {
          update({ stopped: true })
          break
        }
      }
      update({ done: state.done + 1 })
    }

    update({ current: undefined, finished: true })
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: drawingsQueryOptions().queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: foldersQueryOptions().queryKey,
      }),
    ])
  }

  function reset() {
    setScan(undefined)
    setRun(undefined)
    setApiKey("")
  }

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          Import from Excalidraw+
        </h2>
        <p className="text-xs text-muted-foreground">
          Bring your scenes, collections, and images over. Each collection
          becomes a folder.
        </p>
      </div>

      {!scan && (
        <form
          noValidate
          onSubmit={findScenes}
          className="flex max-w-md flex-col gap-5"
        >
          <Field data-invalid={scanError !== undefined}>
            <FieldLabel
              htmlFor="excalidraw-plus-key"
              className="text-sm text-muted-foreground"
            >
              Excalidraw+ API key
            </FieldLabel>
            <Input
              id="excalidraw-plus-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="uk-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              aria-invalid={scanError !== undefined}
            />
            <FieldDescription className="text-xs">
              Create one in Excalidraw+ under workspace settings (
              <a
                href={KEY_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                how
              </a>
              ). A personal key (starts with <code>uk-</code>) also brings your
              private scenes. Read access is enough. The key is used for this
              import only and is not saved.
            </FieldDescription>
            {scanError && (
              <p role="alert" className="text-xs text-destructive">
                {scanError}
              </p>
            )}
          </Field>
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={scanning || !apiKey.trim()}
          >
            {scanning ? "Finding scenes..." : "Find scenes"}
          </Button>
        </form>
      )}

      {scan && !run && (
        <ScanSummary
          scan={scan}
          toImport={toImport}
          teamEnabled={teamEnabled}
          sharedSpace={sharedSpace}
          onSharedSpaceChange={setSharedSpace}
          onImport={() => importAll(toImport)}
          onCancel={reset}
        />
      )}

      {run && (
        <RunProgress
          run={run}
          onStop={() => {
            stopRequested.current = true
          }}
          onDone={reset}
          running={running}
        />
      )}
    </section>
  )
}

function ScanSummary({
  scan,
  toImport,
  teamEnabled,
  sharedSpace,
  onSharedSpaceChange,
  onImport,
  onCancel,
}: {
  scan: Scan
  toImport: ScannedScene[]
  teamEnabled: boolean
  sharedSpace: Space
  onSharedSpaceChange: (space: Space) => void
  onImport: () => void
  onCancel: () => void
}) {
  const collections = new Set(scan.scenes.map((scene) => scene.collection.id))
  const alreadyHere = scan.scenes.length - toImport.length
  const isPrivate = (scene: ScannedScene) =>
    scene.collection.id === PRIVATE_COLLECTION
  const hasShared = toImport.some((scene) => !isPrivate(scene))

  return (
    <div className="flex max-w-md flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-foreground">
          Found {plural(scan.scenes.length, "scene")} in{" "}
          {plural(collections.size, "collection")}.
          {alreadyHere > 0 && ` ${alreadyHere} already imported.`}
        </p>
        {scan.keyType === "workspace" && (
          <p className="text-xs text-muted-foreground">
            This is a workspace key, so your private scenes are not included.
            Use a personal key to bring them too.
          </p>
        )}
      </div>

      {teamEnabled && hasShared && (
        <Field>
          <FieldLabel className="text-sm text-muted-foreground">
            Put shared collections in
          </FieldLabel>
          <Select
            value={sharedSpace}
            items={SPACE_LABELS}
            onValueChange={(space) => onSharedSpaceChange(space as Space)}
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team">{SPACE_LABELS.team}</SelectItem>
              <SelectItem value="private">{SPACE_LABELS.private}</SelectItem>
            </SelectContent>
          </Select>
          {toImport.some(isPrivate) && (
            <FieldDescription className="text-xs">
              Your private scenes always go to Private.
            </FieldDescription>
          )}
        </Field>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={toImport.length === 0} onClick={onImport}>
          {toImport.length === 0
            ? "Nothing new to import"
            : `Import ${plural(toImport.length, "scene")}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Use another key
        </Button>
      </div>
    </div>
  )
}

function RunProgress({
  run,
  running,
  onStop,
  onDone,
}: {
  run: Run
  running: boolean
  onStop: () => void
  onDone: () => void
}) {
  const percent = run.total === 0 ? 100 : (run.done / run.total) * 100

  return (
    <div className="flex max-w-md flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={run.total}
          aria-valuenow={run.done}
          aria-label="Import progress"
          className="h-1.5 overflow-hidden rounded-full bg-well"
        >
          <div
            className="h-full rounded-full bg-iris transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm tabular-nums text-foreground">
          {running
            ? `Importing ${Math.min(run.done + 1, run.total)} of ${run.total}`
            : run.stopped
              ? `Stopped. Imported ${plural(run.imported, "scene")}.`
              : `Imported ${plural(run.imported, "scene")}.`}
        </p>
        {running && run.current && (
          <p className="truncate text-xs text-muted-foreground">
            {run.current}
          </p>
        )}
      </div>

      {run.skippedImages > 0 && (
        <p className="text-xs text-muted-foreground">
          {plural(run.skippedImages, "image")} could not be brought over (too
          large, or missing in Excalidraw+). The drawings show a placeholder
          instead.
        </p>
      )}

      {run.failures.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-destructive">
            {plural(run.failures.length, "scene")} failed:
          </p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs text-muted-foreground">
            {run.failures.map((failure, index) => (
              <li key={index}>
                <span className="text-foreground">{failure.name}</span> —{" "}
                {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <>
            <Button size="sm" render={<Link to="/drawings" />}>
              Open drawings
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Import more
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`
