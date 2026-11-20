import type { Db } from "@/db"
import { drawings } from "@/db/schema"
import type { RoomFileUpload } from "@/features/collab/room-files"
import { sceneRevision } from "@/features/drawings/scene-revision"
import { writeDrawingScene } from "@/features/drawings/scene-write"

/**
 * Writes a drawing kept on a device over the version it was based on. A null
 * `baseRevision` means it was made on the device: it lands in Private under
 * the device's id, so a retry after a lost reply finds it already there.
 */
export async function writeDeviceDrawing(
  db: Db,
  userId: string,
  input: {
    id: string
    name: string
    baseRevision: string | null
    data: string
    files: RoomFileUpload[]
  },
) {
  const { id, name, data, files } = input
  if (input.baseRevision === null) {
    await db
      .insert(drawings)
      .values({ id, name, data, space: "private", createdBy: userId })
      .onConflictDoNothing()
  }
  return writeDrawingScene(db, userId, {
    id,
    data,
    files,
    baseRevision: input.baseRevision ?? (await sceneRevision(data)),
  })
}
