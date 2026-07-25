import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { SignInForm } from "@/components/sign-in-form"
import { resolveRedirect } from "@/lib/redirects"
import { setupMiddleware } from "@/middleware/setup"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  server: { middleware: [setupMiddleware] },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: "/login" })

  return (
    <AuthPage
      title="Welcome back"
      subtitle="Sign in to your Excaliself account"
    >
      <SignInForm
        onSignedIn={() => navigate({ href: resolveRedirect(redirect) })}
      >
        <div className="space-y-1 pt-2 text-center text-xs text-muted-foreground">
          <p>Registration is invite-only on this instance</p>
          <p>Forgot your password? Ask your admin to reset it.</p>
        </div>
      </SignInForm>
    </AuthPage>
  )
}
