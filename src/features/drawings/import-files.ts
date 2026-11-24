import { useQueryClient } from "@tanstack/react-query"
import { createClientOnlyFn } from "@tanstack/react-start"
import { useCallback } from "react"
import { toast } from "sonner"
import type { Space } from "@/db/schema"
import { m } from "@/paraglide/messages"
import { drawingsQueryOptions } from "./queries"
import { importDrawingFile } from "./server"

// Client-only: @excalidraw/excalidraw is not server-safe.
const loadExcalidraw = createClientOnlyFn(
  () => import("@excalidraw/excalidraw"),
)

/** "Plan.excalidraw" → "Plan", also for .json and .excalidraw.png exports. */
const drawingName = (fileName: string) =>
  fileName.replace(/(\.(excalidraw|json|png|svg))+$/i, "")

export type ImportTarget = { folderId: string | null; space: Space }

/**
 * Imports files dropped from the computer as new drawings, one request per
 * file, with a progress toast. Excalidraw reads each file, so old versions
 * and .png/.svg exports with the scene embedded work too.
 */
export function useImportDrawingFiles() {
  const queryClient = useQueryClient()

  return useCallback(
    async (files: File[], target: ImportTarget) => {
      const toastId = toast.loading(
        m.drawings_import_files({ count: files.length }),
      )
      const { getNonDeletedElements, loadFromBlob, serializeAsJSON } =
        await loadExcalidraw()
      const failed: string[] = []
      let skippedImages = 0

      for (const [index, file] of files.entries()) {
        if (files.length > 1)
          toast.loading(
            m.drawings_import_progress({
              current: index + 1,
              total: files.length,
            }),
            {
              id: toastId,
            },
          )
        try {
          const scene = await loadFromBlob(file, null, null)
          const json = serializeAsJSON(
            getNonDeletedElements(scene.elements),
            scene.appState,
            scene.files,
            "local",
          )
          const result = await importDrawingFile({
            data: {
              name: drawingName(file.name),
              ...target,
              lastModified: file.lastModified,
              content: JSON.parse(json),
            },
          })
          skippedImages += result.skippedImages
        } catch {
          failed.push(file.name)
        }
      }

      await queryClient.invalidateQueries(drawingsQueryOptions())

      const imported = files.length - failed.length
      if (imported === 0) {
        toast.error(
          files.length === 1
            ? m.drawings_import_failed_one({ name: files[0].name })
            : m.drawings_import_failed({ count: files.length }),
          { id: toastId, description: m.drawings_import_supported() },
        )
        return
      }
      const notes = [
        failed.length > 0 &&
          m.drawings_import_failed_names({ names: failed.join(", ") }),
        skippedImages > 0 &&
          m.drawings_import_skipped_images({ count: skippedImages }),
      ].filter(Boolean)
      toast.success(m.drawings_import_imported({ count: imported }), {
        id: toastId,
        description: notes.length > 0 ? notes.join(" ") : undefined,
      })
    },
    [queryClient],
  )
}
