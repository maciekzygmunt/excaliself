import { useForm } from "@tanstack/react-form"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { signInFormSchema } from "@/features/auth/schema"
import { authClient } from "@/lib/auth-client"

type Props = {
  /**
   * Runs once the credentials are accepted and the session cookie is set.
   * Where that lands the member is the page's call: /login navigates, the
   * share sign-in gate revalidates in place. Awaited, so a handler that
   * takes a moment (revalidation) keeps the button in its pending state
   * instead of going idle over a page that is about to be replaced.
   */
  onSignedIn: () => void | Promise<void>
  /** Microcopy under the submit button — each page explains its own context. */
  children?: ReactNode
}

/**
 * The instance's only credential form: email + password, nothing else (no
 * remember-me, no SSO, no self-serve reset). Shared by /login and the share
 * sign-in gate so the two can never drift apart.
 */
export function SignInForm({ onSignedIn, children }: Props) {
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInFormSchema },
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn.email(value)
      if (result.error) {
        toast.error(result.error.message)
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
              label="Email"
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
              label="Password"
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
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        )}
      </form.Subscribe>
      {children}
    </form>
  )
}
