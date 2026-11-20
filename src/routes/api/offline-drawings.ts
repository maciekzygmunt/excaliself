import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { db } from "@/db"
import { MAX_NAME_LENGTH } from "@/features/drawings/list-columns"
import { syncPrivateDrawing } from "@/features/offline/sync-drawing"
import { auth } from "@/lib/auth"
import { readCappedBody } from "@/lib/capped-body"
import { fromOwnOrigin } from "@/lib/same-origin"
import { MAX_SERVER_FN_BODY_BYTES } from "@/start"

const submission = z
  .object({
    owner: z.string(),
    id: z.string().min(1),
    name: z.string(),
    baseRevision: z.hash("sha256").nullable(),
    scene: z.object({
      data: z.string(),
      files: z.array(
        z.object({
          fileId: z.string(),
          dataUrl: z.string(),
          mimeType: z.string(),
        }),
      ),
    }),
  })
  .refine(
    ({ id, baseRevision }) =>
      baseRevision !== null || z.uuid().safeParse(id).success,
  )

export const Route = createFileRoute("/api/offline-drawings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!fromOwnOrigin(request)) return new Response(null, { status: 403 })
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) return new Response(null, { status: 401 })
        if (
          Number(request.headers.get("content-length")) >
          MAX_SERVER_FN_BODY_BYTES
        )
          return new Response(null, { status: 413 })
        const body = await readCappedBody(request, MAX_SERVER_FN_BODY_BYTES)
        if (body.status === "too-large")
          return new Response(null, { status: 413 })
        if (body.status !== "ok") return new Response(null, { status: 400 })
        let parsed: unknown
        try {
          parsed = JSON.parse(body.text)
        } catch {
          return new Response(null, { status: 400 })
        }
        const input = submission.safeParse(parsed)
        if (!input.success) return new Response(null, { status: 400 })
        if (
          input.data.baseRevision === null &&
          (input.data.name.length === 0 ||
            input.data.name.length > MAX_NAME_LENGTH)
        )
          return new Response(null, { status: 400 })
        if (input.data.owner !== session.user.id)
          return new Response(null, { status: 403 })
        return Response.json(
          await syncPrivateDrawing(db, session.user.id, input.data),
        )
      },
    },
  },
})
