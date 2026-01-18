import { createFileRoute, redirect } from "@tanstack/react-router"
import { createDrawing, getDrawings } from "@/server/drawings"
import { isSetupComplete } from "@/server/users"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const setupComplete = await isSetupComplete()
    if (!setupComplete) {
      throw redirect({ to: "/setup" })
    }
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
