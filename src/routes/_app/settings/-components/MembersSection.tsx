import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { KeyRound, MoreHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { TypeToConfirmDialog } from "@/components/type-to-confirm-dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user-avatar"
import { userDisplayName, userInitials } from "@/features/account/display-name"
import {
  type CurrentUser,
  currentUserQueryOptions,
} from "@/features/account/queries"
import type { OwnedContentCounts } from "@/features/admin/delete-user"
import { useSetRole } from "@/features/admin/mutations"
import {
  type AdminUser,
  userContentCountsQueryOptions,
  usersQueryOptions,
} from "@/features/admin/queries"
import { adminIds, isLastAdmin, type Role } from "@/features/admin/roles"
import { deleteUser, setUserRole } from "@/features/admin/server"
import { pendingPasswordResetsQueryOptions } from "@/features/password-resets/queries"
import {
  createPasswordReset,
  revokePasswordReset,
} from "@/features/password-resets/server"
import { describeContents } from "@/features/trash/destroy-copy"
import { copyText } from "@/hooks/use-copy"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

// Members list with inline role management (issue #65), admin delete
// (issue #66), and admin-generated password resets (issue #68).
// Deliberately, rows never offer deleting yourself here — and resets are
// for other people by nature, so your own row carries no actions menu;
// your own password changes in Settings → Account.
export function MembersSection() {
  const queryClient = useQueryClient()
  const { data: users, isPending } = useQuery(usersQueryOptions())
  const { data: currentUser } = useQuery(currentUserQueryOptions())
  const { data: pendingResets } = useQuery(pendingPasswordResetsQueryOptions())
  const setRole = useSetRole()
  const [confirmingSelfDemote, setConfirmingSelfDemote] = useState(false)
  const showSkeleton = useDelayedVisible(isPending)

  const revokeReset = useMutation({
    mutationFn: revokePasswordReset,
    onError: () => {
      // Without this a failed revoke would leave the link silently live.
      toast.error(m.settings_members_reset_revoke_failed())
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: pendingPasswordResetsQueryOptions().queryKey,
      })
    },
  })

  if (isPending) return showSkeleton ? <MembersSkeleton /> : null
  if (!users) return null

  const members = [...users].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const admins = adminIds(members)
  const pendingByUserId = new Set(pendingResets?.map((reset) => reset.userId))

  const handleRoleChange = (member: AdminUser, role: Role) => {
    if (role === member.role) return
    // Fail closed: without knowing who's viewing, a self-demote couldn't be
    // told apart from any other demotion and would skip its confirm. The
    // _app loader ensures the currentUser query, so this doesn't happen.
    if (!currentUser) return
    if (member.id === currentUser.id && role === "user") {
      // Losing your own admin access is confirmed first (issue #65); the
      // select stays on Admin because the cache only changes on confirm.
      setConfirmingSelfDemote(true)
      return
    }
    setRole(member.id, role)
  }

  return (
    <section className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          {m.settings_nav_members()}
        </h2>
        <p className="text-xs text-muted-foreground">
          {m.settings_members_count({ count: members.length })}
        </p>
      </div>

      <ul>
        {members.map((member, index) => (
          <li
            key={member.id}
            className={`flex items-center justify-between gap-3 py-2.5 ${
              index !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                initials={userInitials(member)}
                image={member.image}
                className="size-7"
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {userDisplayName(member)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {pendingByUserId.has(member.id) && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  {m.settings_members_reset_pending()}
                  <button
                    type="button"
                    onClick={() =>
                      revokeReset.mutate({ data: { userId: member.id } })
                    }
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-destructive"
                  >
                    {m.settings_revoke()}
                  </button>
                </span>
              )}
              <p className="hidden text-xs text-muted-foreground/60 sm:block">
                {m.settings_members_joined({
                  date: new Date(member.createdAt).toLocaleDateString(
                    getLocale(),
                  ),
                })}
              </p>
              <RoleSelect
                member={member}
                lastAdmin={isLastAdmin(admins, member.id)}
                onChange={(role) => handleRoleChange(member, role)}
              />
              {/* No self-delete here — that lives in the Account danger
                  zone (issue #66) — and no self-reset either: the reset
                  flow exists for people who can't sign in (issue #68).
                  This page being admin-gated, a sole admin is always the
                  viewer, so this also blocks deleting the last admin in
                  the UI; the server enforces both. */}
              {member.id !== currentUser?.id ? (
                <MemberRowActions user={member} />
              ) : (
                // Invisible stand-in for the menu button so the role
                // selects and joined dates line up across rows.
                <div aria-hidden className="size-8" />
              )}
            </div>
          </li>
        ))}
      </ul>

      {currentUser && (
        <SelfDemoteDialog
          open={confirmingSelfDemote}
          onOpenChange={setConfirmingSelfDemote}
          currentUser={currentUser}
        />
      )}
    </section>
  )
}

// The overflow menu: password reset (issue #68) plus the tier-3
// type-to-confirm delete (issue #66). Delete is pessimistic: the dialog
// stays open with an in-button pending state until the server answers,
// then the list invalidation drops the row.
function MemberRowActions({ user }: { user: AdminUser }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()
  const displayName = userDisplayName(user)

  // Fetched only once the dialog is up — the danger copy must state what
  // will actually be destroyed, with fresh counts.
  const { data: counts, isError: countsFailed } = useQuery({
    ...userContentCountsQueryOptions(user.id),
    enabled: confirmOpen,
  })

  // The link is the only copy of the token the admin will ever see — it
  // goes straight to the clipboard (same mechanic as invites) and the
  // toast is the confirmation, so it must not fire if the copy failed;
  // regenerating replaces the link, so a failed copy costs nothing.
  const createResetLink = useMutation({
    mutationFn: () => createPasswordReset({ data: { userId: user.id } }),
    onSuccess: ({ token }) => {
      copyText(`${window.location.origin}/reset-password?token=${token}`).then(
        (ok) =>
          ok
            ? toast.success(m.settings_members_reset_copied())
            : toast.error(m.settings_members_reset_copy_failed()),
      )
    },
    onError: () => toast.error(m.settings_members_reset_create_failed()),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: pendingPasswordResetsQueryOptions().queryKey,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser({ data: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: usersQueryOptions().queryKey,
      })
      // The member count drives teamEnabled.
      queryClient.invalidateQueries({
        queryKey: currentUserQueryOptions().queryKey,
      })
    },
    onError: () =>
      toast.error(m.settings_members_delete_failed({ name: displayName })),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.settings_members_actions({ name: displayName })}
              className="text-muted-foreground/60"
            />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => createResetLink.mutate()}>
            <KeyRound />
            {m.settings_members_reset_password()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            {m.settings_members_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={m.settings_members_delete_title({ name: displayName })}
        description={deleteDescription(displayName, counts, countsFailed)}
        challenge={user.email}
        confirmLabel={m.settings_members_delete()}
        pendingLabel={m.settings_deleting()}
        // No confirm until the copy can state real counts.
        confirmDisabled={!counts}
        onConfirm={() => deleteMutation.mutateAsync()}
      />
    </>
  )
}

function deleteDescription(
  displayName: string,
  counts: OwnedContentCounts | undefined,
  countsFailed: boolean,
) {
  const name = displayName
  if (countsFailed) return m.settings_members_counts_failed({ name })
  if (!counts) return m.settings_members_confirm_loading({ name })
  const contents = describeContents(counts.drawings, counts.folders)
  const kept =
    counts.teamDrawings > 0 &&
    m.settings_members_kept_team({ count: counts.teamDrawings })
  const destroyed = contents
    ? m.settings_members_confirm_contents({ name, contents })
    : kept
      ? m.settings_members_confirm_empty_team({ name })
      : m.settings_members_confirm_empty({ name })
  return [destroyed, m.settings_cannot_undo(), kept].filter(Boolean).join(" ")
}

function RoleSelect({
  member,
  lastAdmin,
  onChange,
}: {
  member: AdminUser
  lastAdmin: boolean
  onChange: (role: Role) => void
}) {
  const roleLabels: Record<Role, string> = {
    admin: m.settings_members_role_admin(),
    user: m.settings_members_role_member(),
  }
  const select = (
    <Select
      value={member.role}
      disabled={lastAdmin}
      // Base UI's Value renders the raw value unless items provides labels
      items={roleLabels}
      onValueChange={(role) => onChange(role as Role)}
    >
      <SelectTrigger
        size="sm"
        aria-label={m.settings_members_role_label({
          name: userDisplayName(member),
        })}
        // Fixed width: "Admin" and "Member" render at different natural
        // widths, which would stagger the Joined column row to row.
        className="h-7 w-24 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user" className="text-xs">
          {roleLabels.user}
        </SelectItem>
        <SelectItem value="admin" className="text-xs">
          {roleLabels.admin}
        </SelectItem>
      </SelectContent>
    </Select>
  )

  if (!lastAdmin) return select

  return (
    <Tooltip>
      {/* A disabled trigger swallows pointer events, so the tooltip listens
          on a focusable wrapper instead. */}
      <TooltipTrigger
        render={
          // tabIndex lets keyboard users reach the wrapper and hear why the
          // control is disabled. inline-block so the anchor rect measured for
          // tooltip positioning actually wraps the select.
          <span
            tabIndex={0}
            className="inline-block rounded-md outline-none focus-visible:ring-ring/30 focus-visible:ring-[2px]"
          />
        }
      >
        {select}
      </TooltipTrigger>
      <TooltipContent>{m.settings_members_last_admin()}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Self-demotion confirm (issue #65). Unlike other rows' optimistic flips,
 * this one is pessimistic: the dialog stays open with an in-button pending
 * state until the server answers, then the admin-only chrome disappears —
 * the currentUser cache flips to member and the router re-runs its loaders
 * after landing on the Account page (the members page itself is admin-only).
 */
function SelfDemoteDialog({
  open,
  onOpenChange,
  currentUser,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: CurrentUser
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      await setUserRole({ data: { userId: currentUser.id, role: "user" } })
    } catch {
      // Stay open — the intent is still live for a retry or a cancel.
      toast.error(m.settings_members_role_change_failed())
      setPending(false)
      return
    }
    queryClient.setQueryData<CurrentUser>(
      currentUserQueryOptions().queryKey,
      (user) => (user ? { ...user, role: "user" } : user),
    )
    onOpenChange(false)
    await navigate({ to: "/settings" })
    await router.invalidate()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.settings_members_demote_title()}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.settings_members_demote_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {m.settings_cancel()}
          </AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {pending
              ? m.settings_members_demoting()
              : m.settings_members_demote()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Mirrors the loaded layout: section header plus a few member rows.
function MembersSkeleton() {
  return (
    <div>
      <div className="mb-4 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div>
        {[0, 1, 2].map((rowIndex) => (
          <div
            key={rowIndex}
            className={`flex items-center gap-3 py-2.5 ${
              rowIndex !== 0 ? "border-t border-border/60" : ""
            }`}
          >
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
