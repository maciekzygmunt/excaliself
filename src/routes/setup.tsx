import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { getUserCount, setupAdmin } from "@/features/admin/server"

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const userCount = await getUserCount()
    if (userCount > 0) throw redirect({ to: "/login" })
  },
  component: SetupPage,
})

const formSchema = z
  .object({
    name: z.string().min(1),
    email: z.email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      })
    }
  })

function SetupPage() {
  const navigate = useNavigate()

  const { mutateAsync: createAdmin } = useMutation({
    mutationFn: setupAdmin,
    onSuccess: () => navigate({ to: "/login" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Setup failed")
    },
  })

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      await createAdmin({ data: value })
    },
  })

  return (
    <AuthPage
      title="Setup your instance"
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
            name="name"
            children={(field) => (
              <FormTextField
                field={field}
                label="Name"
                placeholder="Admin"
                autoComplete="off"
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
              {isSubmitting ? "Creating..." : "Create admin & start"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
