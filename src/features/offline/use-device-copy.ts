import { useCallback, useEffect, useRef, useState } from "react"
import type { PersistedFile, ScenePayload } from "@/features/drawings/scene"
import { sceneRevision } from "@/features/drawings/scene-revision"
import { keepDeviceDrawing, markDeviceDrawingSaved } from "./store"
import { holdDeviceDrawing } from "./sync"
import { useDeviceDraft } from "./use-device-draft"

type Opened = { id: string; name: string; data: string; files: PersistedFile[] }

/**
 * Keeps a private drawing open in the online editor on this device: the
 * stored version on open, then each edit. Autosave still writes the server;
 * report each save through `saving`, so the copy turns clean.
 */
export function useDeviceCopy(
  owner: string | undefined,
  drawing: Opened | null | undefined,
  enabled: boolean,
) {
  const [kept, setKept] = useState<string | null>(null)
  const opened = useRef(drawing)
  opened.current = drawing
  const id = drawing?.id
  const draft = useDeviceDraft(kept && owner ? owner : null, kept)
  const { flush: flushDraft, writer, base } = draft

  // Keyed on the id: later saves update `drawing`, but the copy starts from
  // the version that opened.
  useEffect(() => {
    const open = opened.current
    if (!enabled || !owner || !id || !open) return
    const { granted, release } = holdDeviceDrawing(owner, id)
    let active = true
    void granted
      .then(async () => {
        const revision = await sceneRevision(open.data)
        await keepDeviceDrawing(owner, open, revision)
        // A new session: edits from here build on the scene that opened.
        writer.current = crypto.randomUUID()
        base.current = revision
        if (active) setKept(id)
      })
      .catch(() => {})
    return () => {
      active = false
      release()
      setKept(null)
    }
  }, [enabled, owner, id, base, writer])

  const acknowledge = useCallback(
    (copy: string, { data, files }: ScenePayload, session: string) => {
      if (!owner) return
      const fileIds = files.map((file) => file.fileId)
      void flushDraft()
        .then(async (written) => {
          // The copy holds an older scene. With this save as its base, a
          // sync would upload it over the save.
          if (!written) return
          const revision = await sceneRevision(data)
          await markDeviceDrawingSaved(
            owner,
            copy,
            { data, fileIds },
            revision,
            session,
          )
          if (writer.current === session) base.current = revision
        })
        .catch(() => {})
    },
    [owner, flushDraft, writer, base],
  )

  // A save that lands while the copy is still being kept: applied once it is.
  const early = useRef<ScenePayload | null>(null)
  useEffect(() => {
    const payload = early.current
    if (!kept || !payload) return
    early.current = null
    acknowledge(kept, payload, writer.current)
  }, [kept, acknowledge, writer])
  // Read when a save lands, which can be after the copy got ready.
  const latest = useRef({ kept, acknowledge })
  latest.current = { kept, acknowledge }

  /**
   * Call as a save starts; call what it returns with the payload once the
   * server stored it. Bound to the session the save started in, or, if it
   * started before the copy was ready, to the session the copy began.
   */
  const saving = useCallback(() => {
    const session = latest.current.kept ? writer.current : null
    return (payload: ScenePayload) => {
      const { kept, acknowledge } = latest.current
      if (kept) acknowledge(kept, payload, session ?? writer.current)
      else early.current = payload
    }
  }, [writer])

  /** Resolves whether this device holds every edit so far. */
  const flush = useCallback(
    async () => kept !== null && (await flushDraft()),
    [kept, flushDraft],
  )

  /** Edits land on the device as they're made. */
  const keeping = kept !== null && draft.state !== "failed"

  return { onChange: draft.onChange, flush, saving, keeping }
}
