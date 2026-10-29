import { useHandleLibrary } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { libraryQueryOptions } from "./queries"
import { changeLibrary } from "./server"
import { createLibrarySync } from "./sync"

/**
 * Shows the team library in the editor's Library panel and saves its edits.
 * Returns the `onLibraryChange` handler.
 */
export function useTeamLibrary(excalidrawAPI: ExcalidrawImperativeAPI | null) {
  // Installs from "Browse libraries": the site sends the tab back with an
  // `#addLibrary` link, Excalidraw adds the items, and the change saves them.
  useHandleLibrary({ excalidrawAPI })
  const { data } = useQuery(libraryQueryOptions())

  const sync = useMemo(
    () =>
      excalidrawAPI &&
      createLibrarySync({
        save: (change) => changeLibrary({ data: change }),
        show: (libraryItems) => {
          void excalidrawAPI.updateLibrary({ libraryItems })
        },
        onSaveError: () =>
          toast.error("Couldn't save the library change", {
            id: "library-save-error",
          }),
      }),
    [excalidrawAPI],
  )
  useEffect(() => {
    if (sync && data) sync.receive(data)
  }, [sync, data])

  return sync?.change
}
