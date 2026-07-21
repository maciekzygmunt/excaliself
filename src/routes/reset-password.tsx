import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { newPasswordFormSchema } from "@/features/auth/schema"
import {
  resetPasswordWithToken,
  validatePasswordReset,
} from "@/features/password-resets/server"

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  // A dead link renders an explanation in place — never a silent redirect
  // to /login.
  loader: async ({ deps }) => {
    if (!deps.token) return { reset: null }
    return { reset: await validatePasswordReset({ data: deps.token }) }
  },
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { reset } = Route.useLoaderData()
  if (!reset) return <DeadResetPage />
  return <SetNewPasswordPage email={reset.email} />
}

function DeadResetPage() {
  return (
    <AuthPage
      title="This reset link isn't active"
      subtitle="This reset link has expired or was already used. Ask an admin to generate a new one."
    >
      <Button
        asChild
        className="w-full bg-foreground text-background hover:bg-foreground/90"
      >
        <Link to="/login">Go to sign in</Link>
      </Button>
    </AuthPage>
  )
}

function SetNewPasswordPage({ email }: { email: string }) {
  const { token } = Route.useSearch()
  const navigate = useNavigate()

  // resetPasswordWithToken signs the user in on the same request (their
  // other sessions are revoked server-side), so success goes straight to
  // the app — no bounce through /login.
  const { mutateAsync: resetPassword } = useMutation({
    mutationFn: resetPasswordWithToken,
    onSuccess: () => navigate({ to: "/" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Password reset failed")
    },
  })

  const form = useForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: { onSubmit: newPasswordFormSchema },
    onSubmit: async ({ value }) => {
      await resetPassword({
        data: { token, password: value.password },
      })
    },
  })

  return (
    <AuthPage title="Set a new password" subtitle={`for ${email}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <FieldGroup>
          <form.Field
            name="password"
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
          <form.Field
            name="confirmPassword"
            children={(field) => (
              <FormTextField
                field={field}
                label="Confirm password"
                type="password"
                placeholder="••••••••••"
                autoComplete="new-password"
                required
              />
            )}
          />
        </FieldGroup>
        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              className="w-full bg-foreground text-background hover:bg-foreground/90"
              disabled={!canSubmit}
            >
              {isSubmitting ? "Setting password..." : "Set password"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
