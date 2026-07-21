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

const formSchema = z.object({
  newEmail: z.email("Enter a valid email"),
  currentPassword: z.string().min(1, "Enter your current password"),
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
                ? { currentPassword: { message: "Incorrect password" } }
                : { newEmail: { message: "That email is already in use" } },
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
      toast.success("Sign-in email updated")
    },
  })

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Email</h2>
        <p className="text-xs text-muted-foreground">
          You sign in as <span className="text-foreground">{user.email}</span>.
          Changing it takes effect immediately.
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
                label="New email"
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
                label="Current password"
                type="password"
                placeholder="••••••••••"
                autoComplete="current-password"
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
              {isSubmitting ? "Changing email..." : "Change email"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}
