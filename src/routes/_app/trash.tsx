import { createFileRoute } from "@tanstack/react-router"
import { TrashPage } from "./-components/TrashPage"

// Unlike drawings/folders, trash is not ensured by the layout loader —
// navigation stays instant and the page leans on the delayed-skeleton
// standard (spec §4.3) while the query loads.
export const Route = createFileRoute("/_app/trash")({
  component: TrashPage,
})
