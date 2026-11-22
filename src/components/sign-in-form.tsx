import { useForm } from "@tanstack/react-form"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { authErrorMessage } from "@/features/auth/errors"
import { signInFormSchema } from "@/features/auth/schema"
import { authClient } from "@/lib/auth-client"
import { m } from "@/paraglide/messages"

type Props = {
  /** Awaited, so the button stays pending while the page revalidates. */
  onSignedIn: () => void | Promise<void>
  children?: ReactNode
}

/** Shared by /login and the share sign-in gate. */
export function SignInForm({ onSignedIn, children }: Props) {
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInFormSchema },
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn.email(value)
      if (result.error) {
        toast.error(authErrorMessage(result.error, m.auth_login_failed()))
        return
      }
      await onSignedIn()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="space-y-4"
    >
      <FieldGroup>
        <form.Field
          name="email"
          children={(field) => (
            <FormTextField
              field={field}
              label={m.auth_email_label()}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          )}
        />
        <form.Field
          name="password"
          children={(field) => (
            <FormTextField
              field={field}
              label={m.auth_password_label()}
              type="password"
              placeholder="••••••••••"
              autoComplete="current-password"
              required
            />
          )}
        />
      </FieldGroup>
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isSubmitting ? m.auth_signing_in() : m.auth_sign_in()}
          </Button>
        )}
      </form.Subscribe>
      {children}
    </form>
  )
}
