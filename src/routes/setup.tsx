import { useForm } from "@tanstack/react-form"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { getUserCount, setupAdmin } from "@/features/admin/server"
import { setupFieldsSchema } from "@/features/auth/schema"

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const userCount = await getUserCount()
    if (userCount > 0) throw redirect({ to: "/login" })
  },
  component: SetupPage,
})

function SetupPage() {
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: setupFieldsSchema },
    onSubmit: async ({ value }) => {
      try {
        // Creates the admin account and signs the browser in — the session
        // cookie rides back on this same request.
        await setupAdmin({ data: value })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Setup failed")
        return
      }
      navigate({ to: "/" })
    },
  })

  return (
    <AuthPage
      title="Set up your instance"
      subtitle="Create the admin account to get started"
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
                placeholder="admin@company.com"
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
              {isSubmitting ? "Creating..." : "Create admin & start"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
