// Hard-delete engine behind the admin "Delete user" action (issue #66,
// spec §4.5 tier 3). Kept out of server.ts — which imports the live db — so
// tests can drive it with a fake db, mirroring trash/destroy.ts.

import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { users, verifications } from "@/db/schema"

type Db = NodePgDatabase<typeof schema>

/**
 * Hard-deletes a user account and, via the schema's FK cascades, everything
 * they own: sessions, accounts, folders, drawings, and drawing_files.
 *
 * Two invariants are enforced here rather than trusted to the UI: the last
 * remaining admin can never be deleted (the instance would be locked out of
 * every admin page), and an admin can't delete themselves through this path
 * — self-deletion lives in the Account danger zone with its own flow.
 */
export async function deleteUserAccount(
  db: Db,
  actorId: string,
  userId: string,
): Promise<void> {
  if (userId === actorId) {
    throw new Error("You can't delete your own account from the members page")
  }

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))

    if (!target) {
      throw new Error(`User not found: ${userId}`)
    }

    if (target.role === "admin") {
      // Locked headcount, not a plain count(): two admins deleting each
      // other concurrently would both read 2 and both succeed. FOR UPDATE
      // serializes them, so the second re-reads after the first commits
      // and sees a single admin left.
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .for("update")
      if (admins.length <= 1) {
        throw new Error("Can't delete the last admin")
      }
    }

    const deleted = await tx
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ email: users.email })

    // The row can vanish between the role select and here (another admin
    // deleting the same user); surface it as not-found, not a crash.
    if (deleted.length === 0) {
      throw new Error(`User not found: ${userId}`)
    }

    // verifications has no FK to users — it's keyed by identifier (email)
    // for password resets, email verification, etc. Clean it up manually so
    // orphan rows don't collide with a future re-registration of the same email.
    await tx
      .delete(verifications)
      .where(eq(verifications.identifier, deleted[0].email))
  })
}
