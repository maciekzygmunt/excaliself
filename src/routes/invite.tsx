import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { registerFormSchema } from "@/features/auth/schema"
import { registerWithInvite, validateInvite } from "@/features/invites/server"

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  // A dead link renders an explanation in place — never a silent redirect
  // to /login.
  loader: async ({ deps }) => {
    if (!deps.token) return { invite: null }
    return { invite: await validateInvite({ data: deps.token }) }
  },
  component: InvitePage,
})

function InvitePage() {
  const { invite } = Route.useLoaderData()
  if (!invite) return <DeadInvitePage />
  return <RegisterPage inviterName={invite.inviterName} />
}

function DeadInvitePage() {
  return (
    <AuthPage
      title="This invite link isn't active"
      subtitle="This invite link has expired or was already used. Ask the person who invited you for a new link."
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

function RegisterPage({ inviterName }: { inviterName: string | null }) {
  const { token } = Route.useSearch()
  const navigate = useNavigate()

  // registerWithInvite signs the new member in on the same request, so
  // success goes straight to Home — no bounce through /login.
  const { mutateAsync: register } = useMutation({
    mutationFn: registerWithInvite,
    onSuccess: () => navigate({ to: "/" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Registration failed")
    },
  })

  // Credentials only — no name field: members go by their email prefix
  // until they set a display name in Settings (spec §5.12).
  const form = useForm({
    defaultValues: { email: "", password: "", confirmPassword: "" },
    validators: { onSubmit: registerFormSchema },
    onSubmit: async ({ value }) => {
      await register({
        data: {
          token,
          email: value.email,
          password: value.password,
        },
      })
    },
  })

  return (
    <AuthPage
      title={inviterName ? `${inviterName} invited you` : "You're invited"}
      subtitle="Create your account"
    >
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
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
