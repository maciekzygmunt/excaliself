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
import { m } from "@/paraglide/messages"

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
      title={m.auth_invite_dead_title()}
      subtitle={m.auth_invite_dead_subtitle()}
    >
      <Button
        render={<Link to="/login" />}
        nativeButton={false}
        className="w-full"
      >
        {m.auth_go_to_sign_in()}
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
      toast.error(err instanceof Error ? err.message : m.auth_invite_failed())
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
      title={
        inviterName
          ? m.auth_invite_title_named({ name: inviterName })
          : m.auth_invite_title()
      }
      subtitle={m.auth_invite_subtitle()}
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
                label={m.auth_confirm_password_label()}
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
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {isSubmitting
                ? m.auth_invite_submitting()
                : m.auth_invite_submit()}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
