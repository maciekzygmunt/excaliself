import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { authErrorMessage } from "@/features/auth/errors"
import { authClient } from "@/lib/auth-client"
import { m } from "@/paraglide/messages"

// Matches better-auth's default minPasswordLength, same floor as signup.
// Errors are functions, so they read the language when they show.
const formSchema = z.object({
  currentPassword: z
    .string()
    .min(1, { error: () => m.settings_password_current_required() }),
  newPassword: z
    .string()
    .min(8, { error: () => m.settings_password_too_short() }),
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
        if (error.code === "INVALID_PASSWORD") {
          formApi.setErrorMap({
            onSubmit: {
              fields: {
                currentPassword: { message: m.settings_password_incorrect() },
              },
            },
          })
        } else {
          toast.error(
            authErrorMessage(error, m.settings_password_change_failed()),
          )
        }
        return
      }
      formApi.reset()
      toast.success(m.settings_password_changed())
    },
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          {m.settings_password_title()}
        </h2>
        <p className="text-xs text-muted-foreground">
          {m.settings_password_description()}
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
                label={m.settings_password_current_label()}
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
                label={m.settings_password_new_label()}
                type="password"
                placeholder="••••••••••"
                autoComplete="new-password"
                required
              />
            )}
          />
        </FieldGroup>
        {/* Unlike the auth pages' !canSubmit, disable only while in flight:
            a server-side error must never leave the button stuck disabled. */}
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="sm"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? m.settings_password_submitting()
                : m.settings_password_submit()}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}
