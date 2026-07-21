// Hard-delete engine behind the admin "Delete user" action (issue #66,
// spec §4.5 tier 3) and the Account danger zone's self-delete (issue #67).
// Kept out of server.ts — which imports the live db — so tests can drive it
// with a fake db, mirroring trash/destroy.ts.

import { count, eq, or } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawings, folders, users, verifications } from "@/db/schema"

type Db = NodePgDatabase<typeof schema>

/**
 * Counts everything the delete cascade would destroy — trashed rows
 * included — so both tier-3 confirms (admin delete and the Account danger
 * zone) can state real numbers in their danger copy.
 */
export async function countOwnedContent(
  db: Db,
  userId: string,
): Promise<{ drawings: number; folders: number }> {
  const [[drawingCount], [folderCount]] = await Promise.all([
    db
      .select({ count: count() })
      .from(drawings)
      .where(eq(drawings.ownerId, userId)),
    db
      .select({ count: count() })
      .from(folders)
      .where(eq(folders.ownerId, userId)),
  ])
  return { drawings: drawingCount.count, folders: folderCount.count }
}

/**
 * The admin members-page delete: hardDeleteUser plus one extra invariant —
 * an admin can't delete themselves through this path. Self-deletion lives
 * in the Account danger zone, which calls hardDeleteUser directly.
 */
export async function deleteUserAccount(
  db: Db,
  actorId: string,
  userId: string,
): Promise<void> {
  if (userId === actorId) {
    throw new Error("You can't delete your own account from the members page")
  }

  await hardDeleteUser(db, userId)
}

/**
 * Hard-deletes a user account and, via the schema's FK cascades, everything
 * they own: sessions, accounts, folders, drawings, and drawing_files.
 *
 * One invariant is enforced here rather than trusted to the UI: the last
 * remaining admin can never be deleted (the instance would be locked out of
 * every admin page).
 */
export async function hardDeleteUser(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // One locking read over the target and every admin, mirroring
    // setUserRole's: FOR UPDATE serializes concurrent deletes and role
    // changes (two admins deleting each other would both read 2 admins and
    // both succeed), and the id order keeps overlapping transactions from
    // deadlocking. The target row must be in the locked set even when it
    // isn't an admin — an unlocked role read can go stale while concurrent
    // role changes make the target the sole admin, and the delete would
    // then lock the instance out.
    const relevant = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.id, userId)))
      .orderBy(users.id)
      .for("update")

    const target = relevant.find((row) => row.id === userId)
    if (!target) {
      throw new Error(`User not found: ${userId}`)
    }

    if (target.role === "admin") {
      const admins = relevant.filter((row) => row.role === "admin")
      if (admins.length <= 1) {
        throw new Error("Can't delete the last admin")
      }
    }

    const deleted = await tx
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ email: users.email })

    // With the target row locked it can no longer vanish mid-transaction,
    // but surface an empty delete as not-found rather than trusting that.
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
