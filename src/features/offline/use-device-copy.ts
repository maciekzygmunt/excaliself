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
 * pass each save to `saved`, so the copy turns clean.
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

  const saved = useCallback(
    ({ data, files }: ScenePayload) => {
      if (!owner || !kept) return
      const fileIds = files.map((file) => file.fileId)
      void flushDraft()
        .then(() => sceneRevision(data))
        .then(async (revision) => {
          await markDeviceDrawingSaved(
            owner,
            kept,
            { data, fileIds },
            revision,
            writer.current,
          )
          base.current = revision
        })
        .catch(() => {})
    },
    [owner, kept, flushDraft, writer, base],
  )

  /** Resolves whether this device holds every edit so far. */
  const flush = useCallback(
    async () => kept !== null && (await flushDraft()),
    [kept, flushDraft],
  )

  /** Edits land on the device as they're made. */
  const keeping = kept !== null && draft.state !== "failed"

  return { onChange: draft.onChange, flush, saved, keeping }
}
