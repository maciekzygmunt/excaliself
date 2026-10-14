// Team Drawing entry: members only, by drawing id, no link needed.

import { db } from "@/db"
import { resolveRoomForDrawing } from "@/features/collab/room-drawing"
import {
  defineRoomSocket,
  lastPathSegment,
} from "@/features/collab/room-socket"

export default defineRoomSocket((request) =>
  resolveRoomForDrawing(db, lastPathSegment(request), request.headers),
)
