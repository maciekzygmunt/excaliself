import type { ScenePayload } from "@/features/drawings/scene"

export type SyncRequest = {
  id: string
  name: string
  baseRevision: string | null
  scene: ScenePayload
}

export type SyncResult =
  | { status: "saved"; revision: string }
  | { status: "conflict" | "invalid" }
  | { status: "images"; missingFileIds?: string[]; overCapFileIds?: string[] }

type Submission = SyncRequest & { editId: string; serverFileIds: string[] }

export type LocalDrawing = Submission & {
  owner: string
  status: "clean" | "pending" | "conflict" | "images" | "invalid"
  overCapFileIds?: string[]
  /** Kept across retries so a lost response cannot put a later edit ahead of it. */
  sending?: Submission
}

export function localSaveLabel(status?: LocalDrawing["status"]) {
  switch (status) {
    case "pending":
      return "Saved on this device · waiting to sync"
    case "conflict":
      return "Sync conflict · local version kept"
    case "images":
      return "Sync blocked by an image · local version kept"
    case "invalid":
      return "Sync blocked · local version kept"
    case "clean":
      return "Synced"
    default:
      return ""
  }
}
