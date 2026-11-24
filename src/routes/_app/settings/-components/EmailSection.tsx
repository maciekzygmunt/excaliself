import { ParaglideMessage } from "@inlang/paraglide-js-react"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import type { CurrentUser } from "@/features/account/queries"
import { currentUserQueryOptions } from "@/features/account/queries"
import { changeEmail } from "@/features/account/server"
import { usersQueryOptions } from "@/features/admin/queries"
import { m } from "@/paraglide/messages"
import { Emphasis } from "./Emphasis"

// Errors are functions, so they read the language when they show.
const formSchema = z.object({
  newEmail: z.email({ error: () => m.settings_email_invalid() }),
  currentPassword: z
    .string()
    .min(1, { error: () => m.settings_password_current_required() }),
})

// Email change (spec §5.12, #62): re-authenticate with the current password
// and the sign-in email updates immediately — no verification loop, the
// instance has no SMTP and the email is only a login identifier.
export function EmailSection({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()

  const form = useForm({
    defaultValues: { newEmail: "", currentPassword: "" },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await changeEmail({ data: value })
      if (!result.ok) {
        // FieldError renders `{ message }` shapes, same as zod issues.
        formApi.setErrorMap({
          onSubmit: {
            fields:
              result.error === "invalid-password"
                ? {
                    currentPassword: {
                      message: m.settings_password_incorrect(),
                    },
                  }
                : { newEmail: { message: m.settings_email_taken() } },
          },
        })
        return
      }
      // Every surface showing the email reads these caches.
      queryClient.invalidateQueries({
        queryKey: currentUserQueryOptions().queryKey,
      })
      queryClient.invalidateQueries(usersQueryOptions())
      formApi.reset()
      toast.success(m.settings_email_updated())
    },
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">
          {m.settings_email_title()}
        </h2>
        <p className="text-xs text-muted-foreground">
          <ParaglideMessage
            message={m.settings_email_description}
            inputs={{ email: user.email }}
            markup={{ em: Emphasis }}
          />
        </p>
      </div>

      {/* noValidate: zod owns validation so errors render inline instead of
          the browser's native email tooltip. */}
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
            name="newEmail"
            children={(field) => (
              <FormTextField
                field={field}
                label={m.settings_email_new_label()}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            )}
          />
          <form.Field
            name="currentPassword"
            children={(field) => (
              <FormTextField
                field={field}
                // The Password section has a same-named field on this page.
                id="email-current-password"
                label={m.settings_password_current_label()}
                type="password"
                placeholder="••••••••••"
                autoComplete="current-password"
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
                ? m.settings_email_submitting()
                : m.settings_email_submit()}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}
