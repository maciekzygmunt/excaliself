import { useForm } from "@tanstack/react-form"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { authClient } from "@/lib/auth-client"
import { resolveRedirect } from "@/lib/redirects"
import { setupMiddleware } from "@/middleware/setup"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  server: { middleware: [setupMiddleware] },
  component: LoginPage,
})

const formSchema = z.object({
  email: z.email(),
  password: z.string(),
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/login" })
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn.email(value)
      if (result.error) {
        toast.error(result.error.message)
        return
      }
      navigate({ href: resolveRedirect(redirect) })
    },
  })

  return (
    <AuthPage
      title="Welcome back"
      subtitle="Sign in to your Excaliself account"
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
                autoComplete="current-password"
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
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
        <div className="space-y-1 pt-2 text-center text-xs text-muted-foreground">
          <p>Registration is invite-only on this instance</p>
          <p>Forgot your password? Ask your admin to reset it.</p>
        </div>
      </form>
    </AuthPage>
  )
}
