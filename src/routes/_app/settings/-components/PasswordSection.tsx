import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { authClient } from "@/lib/auth-client"

// Matches better-auth's default minPasswordLength, same floor as signup.
const formSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Must be at least 8 characters"),
})

// Password change (spec §5.12, #62): better-auth verifies the current
// password and, with revokeOtherSessions, signs out every other session —
// this one is re-issued in the same response, so the user stays in.
export function PasswordSection() {
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      })
      if (error) {
        // The endpoint reports a failed re-auth as this exact message; the
        // body carries no machine code (FieldError renders `{ message }`).
        if (error.message === "Invalid password") {
          formApi.setErrorMap({
            onSubmit: {
              fields: { currentPassword: { message: "Incorrect password" } },
            },
          })
        } else {
          toast.error(error.message ?? "Couldn't change password")
        }
        return
      }
      formApi.reset()
      toast.success("Password changed — other sessions are signed out")
    },
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Password</h2>
        <p className="text-xs text-muted-foreground">
          Changing it signs you out everywhere else.
        </p>
      </div>

      {/* noValidate: zod owns validation so errors render inline instead of
          the browser's native tooltips. */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="flex max-w-md flex-col gap-5"
      >
        <FieldGroup>
          <form.Field
            name="currentPassword"
            children={(field) => (
              <FormTextField
                field={field}
                // The Email section has a same-named field on this page.
                id="password-current-password"
                label="Current password"
                type="password"
                placeholder="••••••••••"
                autoComplete="current-password"
                required
              />
            )}
          />
          <form.Field
            name="newPassword"
            children={(field) => (
              <FormTextField
                field={field}
                label="New password"
                type="password"
                placeholder="••••••••••"
                autoComplete="new-password"
                required
              />
            )}
          />
        </FieldGroup>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="sm"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Changing password..." : "Change password"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}
