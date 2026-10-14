// A Share link's Room images. Reads rely on the 256-bit token alone.

import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { roomFileHandlers } from "@/features/collab/room-file-route"
import { resolveRoomForToken } from "@/features/collab/room-token"

export const { getRoomFile, postRoomFile } = roomFileHandlers<{
  token: string
  fileId: string
}>((request, params) => resolveRoomForToken(db, params.token, request.headers))

export const Route = createFileRoute("/api/rooms/$token/files/$fileId")({
  server: {
    handlers: {
      GET: getRoomFile,
      POST: postRoomFile,
    },
  },
})
