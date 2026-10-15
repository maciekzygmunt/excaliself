// Share link entry: anyone the link's audience admits, guests included.

import { db } from "@/db"
import {
  defineRoomSocket,
  lastPathSegment,
} from "@/features/collab/room-socket"
import { resolveRoomForToken } from "@/features/collab/room-token"

export default defineRoomSocket(
  (request) =>
    resolveRoomForToken(db, lastPathSegment(request), request.headers),
  { limitFailures: true },
)
