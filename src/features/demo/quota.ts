import { count, eq } from "drizzle-orm"
import type { Db } from "@/db"
import { drawings, folders } from "@/db/schema"
import { instanceMode } from "@/lib/mode"
import { DEMO_LIMITS, demoRefusals } from "./policy"

/**
 * In the demo, refuses a new drawing or folder once the visitor has the
 * cap. Call it inside the create transaction.
 */
export async function checkDemoQuota(
  tx: Pick<Db, "select">,
  kind: "drawings" | "folders",
  userId: string,
) {
  if (instanceMode !== "demo") return
  const table = kind === "drawings" ? drawings : folders
  const [{ total }] = await tx
    .select({ total: count() })
    .from(table)
    .where(eq(table.createdBy, userId))
  if (total >= DEMO_LIMITS.perAccount[kind]) {
    throw new Error(demoRefusals[kind])
  }
}
