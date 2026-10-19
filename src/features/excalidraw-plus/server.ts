"use server"

// The Excalidraw+ import. The client scans once, then imports scene by scene
// so it can show progress; the key rides along on each call and is never
// stored.

import { createServerFn } from "@tanstack/react-start"
import { and, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawings, spaces } from "@/db/schema"
import { env } from "@/env"
import { accessibleTo } from "@/features/spaces/access"
import { authMiddleware } from "@/middleware/auth"
import { listsChangedMiddleware } from "@/middleware/lists-changed"
import { excalidrawPlusApi, PRIVATE_COLLECTION } from "./api"
import { type ImportScene, importScene } from "./import"

const apiKey = z.string().trim().min(1).max(1000)

export type ScannedScene = ImportScene & { imported: boolean }

/** Every scene the key can read, each flagged when the member already has it. */
export const scanExcalidrawPlus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ apiKey }))
  .handler(async ({ data, context }) =>
    readableErrors(async () => {
      const api = excalidrawPlusApi(env.EXCALIDRAW_PLUS_API_URL, data.apiKey)
      const collections = (await api.collections()).filter(
        (collection) => collection.id !== PRIVATE_COLLECTION,
      )
      if (api.keyType === "personal")
        collections.push({ id: PRIVATE_COLLECTION, name: "Private" })

      const scenes = new Map<string, ImportScene>()
      for (const collection of collections) {
        for (const scene of await api.scenesIn(collection.id)) {
          if (!scenes.has(scene.id))
            scenes.set(scene.id, { ...scene, collection })
        }
      }

      const imported = new Set<string>()
      if (scenes.size > 0) {
        const rows = await db
          .select({ id: drawings.excalidrawPlusId })
          .from(drawings)
          .where(
            and(
              inArray(drawings.excalidrawPlusId, [...scenes.keys()]),
              accessibleTo(drawings, context.session.user.id),
            ),
          )
        for (const row of rows) if (row.id) imported.add(row.id)
      }

      return {
        keyType: api.keyType,
        scenes: [...scenes.values()].map(
          (scene): ScannedScene => ({
            ...scene,
            imported: imported.has(scene.id),
          }),
        ),
      }
    }),
  )

export const importExcalidrawPlusScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware, listsChangedMiddleware])
  .validator(
    z.object({
      apiKey,
      scene: z.object({
        id: z.string().min(1).max(200),
        name: z.string().max(1000),
        created: z.coerce.date().optional(),
        updated: z.coerce.date().optional(),
        pinned: z.boolean(),
        collection: z.object({
          id: z.string().min(1).max(200),
          name: z.string().max(1000),
        }),
      }),
      sharedSpace: z.enum(spaces),
    }),
  )
  .handler(async ({ data, context }) =>
    readableErrors(async () => {
      const content = await excalidrawPlusApi(
        env.EXCALIDRAW_PLUS_API_URL,
        data.apiKey,
      ).sceneContent(data.scene.id)
      return importScene(db, context.session.user.id, {
        scene: data.scene,
        content,
        sharedSpace: data.sharedSpace,
      })
    }),
  )

/** A response this import can't read reaches the client as one plain sentence. */
async function readableErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new Error("Excalidraw+ sent data this import can't read")
    throw error
  }
}
