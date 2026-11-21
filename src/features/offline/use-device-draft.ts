import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildScenePayload,
  getScenePayloadSignature,
  type SceneData,
} from "@/features/drawings/scene"
import { useDebounceCallback } from "@/hooks/use-debounce-callback"
import { writeDeviceDraft } from "./store"

/**
 * Writes an editor's changes to its device copy once they pause. The first
 * change is the scene as it opened, not an edit. `failed` means the last
 * write did not land. Set `writer` to a new id and `base` to the server
 * version the edits build on whenever the editor adopts a loaded scene, and
 * advance `base` after each save of this editor.
 */
export function useDeviceDraft(owner: string | null, id: string | null) {
  // Starts as the scene as it opened, so returning to it writes it back.
  const writtenSig = useRef<string | null>(null)
  const writes = useRef(Promise.resolve(true))
  const base = useRef<string | null>(null)
  const writer = useRef("")
  const [state, setState] = useState<"opened" | "written" | "failed">("opened")

  // A change made before the copy is ready, written once it is.
  const missed = useRef<SceneData | null>(null)
  const write = useDebounceCallback((scene: SceneData) => {
    if (!owner || !id) {
      missed.current = scene
      return
    }
    const payload = buildScenePayload(scene)
    const sig = getScenePayloadSignature(payload)
    if (sig === writtenSig.current) return
    writtenSig.current = sig
    // The session at queue time: a new one may start before this lands.
    const session = { writer: writer.current, base: base.current }
    writes.current = writes.current
      .then(() =>
        writeDeviceDraft(owner, id, payload, session.writer, session.base),
      )
      .catch(() => false)
      .then((ok) => {
        // A failed write is retried by the next change.
        if (!ok && writtenSig.current === sig) writtenSig.current = null
        setState(ok ? "written" : "failed")
        return ok
      })
  }, 300)

  const opened = useRef(false)
  const onChange = useCallback(
    (scene: SceneData) => {
      if (!opened.current) {
        opened.current = true
        writtenSig.current = getScenePayloadSignature(buildScenePayload(scene))
        return
      }
      write.run(scene)
    },
    [write],
  )

  /** Writes what's waiting. Resolves whether the device holds the edits. */
  const flush = useCallback(() => {
    write.flush()
    return writes.current
  }, [write])

  useEffect(() => {
    const scene = missed.current
    if (!owner || !id || !scene) return
    missed.current = null
    write.run(scene)
  }, [owner, id, write])

  useEffect(() => () => write.flush(), [write])

  return { onChange, flush, state, writer, base }
}
