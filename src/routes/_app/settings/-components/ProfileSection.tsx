import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { emailPrefix } from "@/features/account/display-name"
import { useUpdateProfile } from "@/features/account/mutations"
import type { CurrentUser } from "@/features/account/queries"

// Profile block (spec §5.12): optional display name with optimistic save.
// The sign-in email lives in the Email section below, with its change flow.
export function ProfileSection({ user }: { user: CurrentUser }) {
  const updateProfile = useUpdateProfile()
  const currentName = user.name ?? ""

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
            placeholder={emailPrefix(user.email)}
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
      </div>
    </section>
  )
}
