import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildScenePayload,
  type SceneData,
  type ScenePayload,
} from "@/features/drawings/scene"
import {
  readLocalDrawing,
  saveLocalDrawing,
  subscribeToLocalDrawings,
} from "./store"
import { syncLocalDrawing } from "./sync"
import type { LocalDrawing } from "./types"

function sameScene(a: ScenePayload, b: ScenePayload) {
  return (
    a.data === b.data &&
    a.files.length === b.files.length &&
    a.files.every(
      (file, index) =>
        file.fileId === b.files[index].fileId &&
        file.dataUrl === b.files[index].dataUrl,
    )
  )
}

/** Writes to the device immediately and coalesces changes during an IDB write. */
export function useLocalEditor(initial: LocalDrawing | null) {
  const draft = useRef(initial)
  const initialChange = useRef<ScenePayload | null>(null)
  const latest = useRef<ScenePayload | null>(null)
  const writing = useRef<Promise<void> | null>(null)
  const [drawing, setDrawing] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    draft.current = initial
    initialChange.current = null
    latest.current = null
    setDrawing(initial)
  }, [initial])

  const { id, owner } = drawing ?? {}
  useEffect(() => {
    if (!id || !owner) return
    const refresh = () => {
      void readLocalDrawing(owner, id)
        .then((current) => {
          if (current && draft.current?.editId === current.editId)
            setDrawing(current)
        })
        .catch(() => {})
    }
    const unsubscribe = subscribeToLocalDrawings(refresh)
    refresh()
    return unsubscribe
  }, [id, owner])

  const persist = useCallback(() => {
    if (writing.current) return writing.current
    const run = async () => {
      while (
        draft.current &&
        latest.current &&
        !sameScene(draft.current.scene, latest.current)
      ) {
        const saved = await saveLocalDrawing(draft.current, latest.current)
        draft.current = saved
        setDrawing(saved)
      }
    }
    setSaving(true)
    const pending = run()
      .then(
        () => setFailed(false),
        (error) => {
          setFailed(true)
          throw error
        },
      )
      .finally(() => {
        writing.current = null
        setSaving(false)
      })
    writing.current = pending
    return pending
  }, [])

  const onChange = useCallback(
    (scene: SceneData) => {
      if (!draft.current) return
      const payload = buildScenePayload(scene)
      // Restoring an older scene normalizes it. Waiting for an actual edit
      // prevents a read-only visit from queuing the normalized representation.
      if (!initialChange.current) {
        initialChange.current = payload
        return
      }
      if (sameScene(initialChange.current, payload) && !latest.current) return
      latest.current = payload
      if (!sameScene(draft.current.scene, payload) && !writing.current)
        void persist().catch(() => {})
    },
    [persist],
  )

  const flush = useCallback(async () => {
    if (!draft.current) return
    await persist()
    const { owner, id } = draft.current
    await syncLocalDrawing(owner, id)
    const current = await readLocalDrawing(owner, id)
    if (current?.status !== "clean")
      throw new Error("The drawing is saved locally and still needs to sync")
  }, [persist])

  return { drawing, saving, failed, onChange, flush }
}
