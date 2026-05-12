import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { z } from "zod"
import { AuthPage } from "@/components/auth-page"
import { FormTextField } from "@/components/form-text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { consumeInvite, validateInvite } from "@/features/auth/server"
import { auth } from "@/lib/auth"

const registerWithInvite = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { token: string; email: string; password: string; name: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const invite = await validateInvite({ data: data.token })
    if (!invite) {
      throw new Error("Invalid or expired invite link")
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    })

    if (!result.user) {
      throw new Error("Failed to create account")
    }

    await consumeInvite({ data: { token: data.token, userId: result.user.id } })
  })

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
    validators: { onSubmit: formSchema },
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
