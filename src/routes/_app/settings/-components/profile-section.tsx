import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useUpdateProfile } from "@/features/account/mutations"
import type { CurrentUser } from "@/features/account/queries"

// Profile block (spec §5.12): optional display name with optimistic save,
// email shown read-only — changing it is a later ticket's credential flow.
export function ProfileSection({ user }: { user: CurrentUser }) {
  const updateProfile = useUpdateProfile()
  const currentName = user.name ?? ""
  const emailPrefix = user.email.split("@")[0] || user.email

  const commit = (input: HTMLInputElement) => {
    const next = input.value.trim()
    if (next === currentName) return
    updateProfile(next)
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Profile</h2>
        <p className="text-xs text-muted-foreground">
          How you appear to others on this instance
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-5">
        {/* Uncontrolled + keyed by the saved name: a rollback (or an edit
            from elsewhere) remounts the input with the authoritative value
            without fighting in-progress typing. */}
        <Field>
          <FieldLabel htmlFor="display-name">Display name</FieldLabel>
          <Input
            key={currentName}
            id="display-name"
            defaultValue={currentName}
            placeholder={emailPrefix}
            maxLength={120}
            autoComplete="name"
            onBlur={(e) => commit(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget)
              if (e.key === "Escape") e.currentTarget.value = currentName
            }}
          />
          <FieldDescription>
            Optional — when empty you go by your email prefix.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input
            id="account-email"
            readOnly
            value={user.email}
            className="text-muted-foreground focus-visible:ring-0 focus-visible:border-input/80"
          />
          <FieldDescription>This is your sign-in email.</FieldDescription>
        </Field>
      </div>
    </section>
  )
}
