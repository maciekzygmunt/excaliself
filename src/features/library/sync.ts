import type { LibraryItem, LibraryItems } from "@excalidraw/excalidraw/types"

export type LibraryChange = { add: LibraryItem[]; remove: string[] }

/** What turns `prev` into `next`, by item id. New items keep `next`'s order. */
export function diffLibrary(
  prev: LibraryItems,
  next: LibraryItems,
): LibraryChange {
  const prevIds = new Set(prev.map((item) => item.id))
  const nextIds = new Set(next.map((item) => item.id))
  return {
    add: next.filter((item) => !prevIds.has(item.id)),
    remove: prev.filter((item) => !nextIds.has(item.id)).map(({ id }) => id),
  }
}

const sameItems = (a: LibraryItems, b: LibraryItems) =>
  a.length === b.length && a.every((item, i) => item.id === b[i].id)

/**
 * Keeps the editor's Library panel and the team library in step. Panel edits
 * go up as adds and removes, one save at a time. The server's library comes
 * back down and replaces the panel, but never while a save is in flight. A
 * teammate's change heard then may be newer than the save's answer, so it is
 * loaded again once saves settle. A failed save puts the server's library back.
 */
export function createLibrarySync(options: {
  save: (change: LibraryChange) => Promise<LibraryItems>
  load: () => Promise<LibraryItems>
  show: (items: LibraryItems) => void
  onSaveError: (error: unknown) => void
}) {
  // What the panel shows, or will once Excalidraw applies `show`.
  let shown: LibraryItems = []
  // The server's library, as last heard.
  let synced: LibraryItems = []
  let saving = 0
  // Bumped by every save, so a load can tell it went stale.
  let saves = 0
  let heardWhileSaving = false
  let queue = Promise.resolve()

  const showSynced = () => {
    if (sameItems(shown, synced)) return
    shown = synced
    options.show(synced)
  }

  /** The server's library: the first load, or a teammate's change. */
  const receive = (items: LibraryItems) => {
    synced = items
    if (saving === 0) showSynced()
    else heardWhileSaving = true
  }

  // A save that starts during the load may answer first; drop the load's
  // older list, and load again once saves settle.
  const reload = () => {
    const startedAt = saves
    options.load().then(
      (items) => {
        if (saves === startedAt) receive(items)
        else if (saving > 0) heardWhileSaving = true
        else reload()
      },
      () => {},
    )
  }

  return {
    receive,

    /** For `onLibraryChange`. Ignores the echo of `show`. */
    change(items: LibraryItems) {
      const change = diffLibrary(shown, items)
      shown = items
      if (change.add.length === 0 && change.remove.length === 0) return
      saving++
      saves++
      queue = queue
        .then(() => options.save(change))
        .then((latest) => {
          synced = latest
        }, options.onSaveError)
        .finally(() => {
          if (--saving > 0) return
          showSynced()
          if (!heardWhileSaving) return
          heardWhileSaving = false
          reload()
        })
    },
  }
}
