// A Team Drawing's Room images, for members who joined it by id.

import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { resolveRoomForDrawing } from "@/features/collab/room-drawing"
import { roomFileHandlers } from "@/features/collab/room-file-route"

const { getRoomFile, postRoomFile } = roomFileHandlers<{
  id: string
  fileId: string
}>((request, params) => resolveRoomForDrawing(db, params.id, request.headers))

export const Route = createFileRoute("/api/drawings/$id/files/$fileId")({
  server: {
    handlers: {
      GET: getRoomFile,
      POST: postRoomFile,
    },
  },
})
