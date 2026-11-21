import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import {
  importExcalidrawPlusScene,
  type ScannedScene,
  scanExcalidrawPlus,
} from "@/features/excalidraw-plus/server"
import { foldersQueryOptions } from "@/features/folders/queries"
import { m } from "@/paraglide/messages"

const KEY_DOCS_URL = "https://plus.excalidraw.com/docs/api/authentication"

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
  error instanceof Error ? error.message : m.settings_import_error_generic()

// Brings Excalidraw+ scenes over: scan with an API key, then import one scene
// per request so progress shows and one bad scene can't sink the rest. Admins
// bring the shared collections to Team; every member brings their private
// scenes. The key lives only in this component's state.
export function ImportSection() {
  const queryClient = useQueryClient()
  const { data: user } = useQuery(currentUserQueryOptions())
  const [apiKey, setApiKey] = useState("")
  const [scan, setScan] = useState<Scan>()
  const [scanError, setScanError] = useState<string>()
  const [scanning, setScanning] = useState(false)
  const [run, setRun] = useState<Run>()
  const stopRequested = useRef(false)

  const isAdmin = user?.role === "admin"
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
      update({ current: scene.name || m.settings_import_untitled() })
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
            { name: scene.name || m.settings_import_untitled(), message },
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
          {m.settings_import_title()}{" "}
          {/* Built from the docs and Excalidraw's CLI, not yet run on a real account. */}
          <span className="font-normal text-muted-foreground">
            {m.settings_import_beta()}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? m.settings_import_description_admin()
            : m.settings_import_description_member()}
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
              {m.settings_import_key_label()}
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
              <ParaglideMessage
                message={m.settings_import_key_hint_create}
                markup={{
                  link: ({ children }) => (
                    <a
                      href={KEY_DOCS_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {children}
                    </a>
                  ),
                }}
              />{" "}
              {isAdmin
                ? m.settings_import_key_hint_admin()
                : m.settings_import_key_hint_member()}{" "}
              {m.settings_import_key_hint_access()}
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
            {scanning ? m.settings_import_finding() : m.settings_import_find()}
          </Button>
        </form>
      )}

      {scan && !run && (
        <ScanSummary
          scan={scan}
          toImport={toImport}
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
  onImport,
  onCancel,
}: {
  scan: Scan
  toImport: ScannedScene[]
  onImport: () => void
  onCancel: () => void
}) {
  const collections = new Set(scan.scenes.map((scene) => scene.collection.id))
  const alreadyHere = scan.scenes.length - toImport.length

  return (
    <div className="flex max-w-md flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-foreground">
          {m.settings_import_found({
            scenes: m.settings_import_found_scenes({
              count: scan.scenes.length,
            }),
            collections: m.settings_import_found_collections({
              count: collections.size,
            }),
          })}
          {alreadyHere > 0 &&
            ` ${m.settings_import_already_imported({ count: alreadyHere })}`}
        </p>
        {scan.keyType === "workspace" && (
          <p className="text-xs text-muted-foreground">
            {m.settings_import_workspace_key()}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={toImport.length === 0} onClick={onImport}>
          {toImport.length === 0
            ? m.settings_import_nothing_new()
            : m.settings_import_start({ count: toImport.length })}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {m.settings_import_use_another_key()}
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
          aria-label={m.settings_import_progress_label()}
          className="h-1.5 overflow-hidden rounded-full bg-well"
        >
          <div
            className="h-full rounded-full bg-iris transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm tabular-nums text-foreground">
          {running
            ? m.settings_import_importing({
                current: Math.min(run.done + 1, run.total),
                total: run.total,
              })
            : run.stopped
              ? m.settings_import_stopped({ count: run.imported })
              : m.settings_import_imported({ count: run.imported })}
        </p>
        {running && run.current && (
          <p className="truncate text-xs text-muted-foreground">
            {run.current}
          </p>
        )}
      </div>

      {run.skippedImages > 0 && (
        <p className="text-xs text-muted-foreground">
          {m.settings_import_skipped_images({ count: run.skippedImages })}
        </p>
      )}

      {run.failures.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-destructive">
            {m.settings_import_failed({ count: run.failures.length })}
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
            {m.settings_import_stop()}
          </Button>
        ) : (
          <>
            <Button size="sm" render={<Link to="/drawings" />}>
              {m.settings_import_open_drawings()}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              {m.settings_import_more()}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
