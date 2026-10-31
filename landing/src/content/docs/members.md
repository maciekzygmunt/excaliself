---
title: Members and invites
description: Invite people, set roles, reset passwords, and remove accounts.
---

The first visitor creates the admin account at `/setup`. After that, people join
only with an invite link. Admins manage the instance under **Settings**, in
**Members**, **Invites**, and **Instance**.

## Invite someone

Open **Settings**, then **Invites**, and click **Generate link**. Each link is
single-use and expires after 7 days. Send it to the person. They create their
account from it.

## Roles

A member is either an admin or a member. Change the role in **Settings**, then
**Members**. The last admin cannot be demoted.

## Reset a password

In **Settings**, then **Members**, generate a reset link for the member and send
it to them. The link is single-use and is valid for 24 hours.

If no admin can sign in, see [Recover admin access](/docs/admin-recovery/).

## Delete a member

Deleting a member permanently deletes their account and their private drawings
and folders. This cannot be undone. Their Team drawings stay, and their
[access tokens](/docs/mcp/#access) stop working.

## Your own account

Under **Settings**, then **Account**, you can see the devices signed in to your
account and sign out the others. You can also delete your account there. The
only admin of an instance must promote another member first.

## Instance stats

**Settings**, then **Instance**, shows an overview of the instance, including the
storage it uses.
