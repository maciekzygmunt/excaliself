import { createFileRoute, redirect } from "@tanstack/react-router"
import { setupMiddleware } from "@/middleware/setup"
import { createDrawing, getDrawings } from "@/server/drawings"

export const Route = createFileRoute("/")({
  server: {
    middleware: [setupMiddleware],
  },
  loader: async () => {
    const drawings = await getDrawings()
    if (drawings.length === 0) {
      const id = await createDrawing({ data: {} })
      throw redirect({ to: "/draw/$id", params: { id } })
    }
    throw redirect({ to: "/draw/$id", params: { id: drawings[0].id } })
  },
  component: () => null,
})
