// Hard-delete engine behind the admin "Delete user" action (issue #66,
// spec §4.5 tier 3) and the Account danger zone's self-delete (issue #67).
// Kept out of server.ts — which imports the live db — so tests can drive it
// with a fake db, mirroring trash/destroy.ts.

import { and, count, eq, or } from "drizzle-orm"
import type { Db } from "@/db"
import { drawings, folders, shares, users, verifications } from "@/db/schema"
import { inPrivateSpaceOf } from "@/features/spaces/access"

/** What both delete confirms state: the Private rows destroyed, the Team drawings kept. */
export type OwnedContentCounts = {
  drawings: number
  folders: number
  teamDrawings: number
}

/**
 * Counts for both tier-3 confirms (admin delete and the Account danger
 * zone): everything the delete destroys — the user's Private rows, trashed
 * ones included — plus the Team drawings they created, which stay.
 */
export async function countOwnedContent(
  db: Db,
  userId: string,
): Promise<OwnedContentCounts> {
  const [[drawingCount], [folderCount], [teamDrawingCount]] = await Promise.all(
    [
      db
        .select({ count: count() })
        .from(drawings)
        .where(inPrivateSpaceOf(drawings, userId)),
      db
        .select({ count: count() })
        .from(folders)
        .where(inPrivateSpaceOf(folders, userId)),
      // Not an access check: a count of what the user created in Team, for
      // the "N Team drawings stay with the team" sentence.
      db
        .select({ count: count() })
        .from(drawings)
        .where(and(eq(drawings.createdBy, userId), eq(drawings.space, "team"))),
    ],
  )
  return {
    drawings: drawingCount.count,
    folders: folderCount.count,
    teamDrawings: teamDrawingCount.count,
  }
}

/** The user's shared Private drawings, whose live rooms must close on delete. */
export async function sharedDrawingIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: drawings.id })
    .from(drawings)
    .innerJoin(shares, eq(shares.drawingId, drawings.id))
    .where(inPrivateSpaceOf(drawings, userId))
  return rows.map((row) => row.id)
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
 * Hard-deletes a user account: their Private drawings and folders (with
 * drawing_files) explicitly, then the user row, whose FK cascades take
 * sessions, accounts and stars. Team rows they created stay, with createdBy
 * set to null.
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

    // Before the user row: once createdBy is set to null, a Private row
    // would break the "private needs a creator" check.
    await tx.delete(drawings).where(inPrivateSpaceOf(drawings, userId))
    await tx.delete(folders).where(inPrivateSpaceOf(folders, userId))

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
