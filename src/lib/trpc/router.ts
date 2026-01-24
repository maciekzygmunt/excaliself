import { router } from "./init"
import { adminRouter } from "./routers/admin"
import { drawingsRouter } from "./routers/drawings"
import { foldersRouter } from "./routers/folders"

export const appRouter = router({
  admin: adminRouter,
  drawings: drawingsRouter,
  folders: foldersRouter,
})

export type AppRouter = typeof appRouter
