import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
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
  beforeLoad: async ({ search }) => {
    if (!search.token) throw redirect({ to: "/login" })
    const invite = await validateInvite({ data: search.token })
    if (!invite) throw redirect({ to: "/login" })
  },
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()

  const { mutateAsync: register } = useMutation({
    mutationFn: registerWithInvite,
    onSuccess: () => navigate({ to: "/login" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Registration failed")
    },
  })

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    validators: { onSubmit: registerFormSchema },
    onSubmit: async ({ value }) => {
      await register({
        data: {
          token,
          name: value.name,
          email: value.email,
          password: value.password,
        },
      })
    },
  })

  return (
    <AuthPage
      title="You're invited"
      subtitle="Create your account to start using Excaliself"
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
            name="name"
            children={(field) => (
              <FormTextField
                field={field}
                label="Name"
                placeholder="Your name"
                autoComplete="name"
                required
              />
            )}
          />
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
