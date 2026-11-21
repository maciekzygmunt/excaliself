"use server"

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { MAX_NAME_LENGTH } from "@/features/drawings/list-columns"
import { authMiddleware } from "@/middleware/auth"
import { listsChangedMiddleware } from "@/middleware/lists-changed"
import { writeDeviceDrawing } from "./device-write"

/** Uploads one drawing kept on a device. See `writeDeviceDrawing`. */
export const syncDeviceDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware, listsChangedMiddleware])
  .validator(
    z.object({
      // The account that kept the copy. Another account's session on the
      // same browser must not upload it.
      owner: z.string(),
      id: z.string().min(1),
      name: z.string().min(1).max(MAX_NAME_LENGTH),
      baseRevision: z.string().nullable(),
      data: z.string(),
      files: z.array(z.object({ fileId: z.string(), dataUrl: z.string() })),
    }),
  )
  .handler(({ data: { owner, ...input }, context }) => {
    const userId = context.session.user.id
    if (owner !== userId) return { status: "wrong-account" as const }
    return writeDeviceDrawing(db, userId, input)
  })
