import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { SignInForm } from "@/components/sign-in-form"
import { SsoButtons } from "@/components/sso-buttons"
import { demoAdmin } from "@/db/demo-content"
import { getSignInOptions } from "@/features/auth/server"
import { resolveRedirect } from "@/lib/redirects"
import { setupMiddleware } from "@/middleware/setup"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

type LoginSearch = { redirect?: string; error?: string }

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    // Set by Better Auth when an SSO sign-in fails.
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  server: { middleware: [setupMiddleware] },
  loader: () => getSignInOptions(),
  component: LoginPage,
})

// Better Auth's ?error= codes we explain; others get the generic line.
const SSO_ERRORS: Record<string, () => string> = {
  signup_not_allowed: m.auth_login_sso_no_account,
  account_not_linked: m.auth_login_sso_not_linked,
}

function LoginPage() {
  const navigate = useNavigate()
  const { redirect, error } = useSearch({ from: "/login" })
  const { previewMode, ssoProviders, ssoAllowedDomains } = Route.useLoaderData()

  return (
    <AuthPage title={m.auth_login_title()} subtitle={m.auth_login_subtitle()}>
      {error && (
        <p role="alert" className="mb-4 text-center text-sm text-destructive">
          {SSO_ERRORS[error]?.() ?? m.auth_login_failed()}
        </p>
      )}
      <SsoButtons
        providers={ssoProviders}
        callbackURL={resolveRedirect(redirect)}
        errorCallbackURL={
          redirect ? `/login?${new URLSearchParams({ redirect })}` : "/login"
        }
      />
      <SignInForm
        onSignedIn={() => navigate({ href: resolveRedirect(redirect) })}
      >
        <div className="space-y-1 pt-2 text-center text-xs text-muted-foreground">
          <p>
            {ssoAllowedDomains.length > 0
              ? m.auth_login_new_sso({
                  domains: new Intl.ListFormat(getLocale(), {
                    type: "disjunction",
                  }).format(ssoAllowedDomains),
                })
              : m.auth_login_invite_only()}
          </p>
          <p>{m.auth_login_forgot()}</p>
        </div>
      </SignInForm>
      {previewMode && <PreviewShortcuts redirect={redirect} />}
    </AuthPage>
  )
}

// PR previews only. Plain links: /preview/login is a server route. It
// checks the redirect itself.
function PreviewShortcuts({ redirect }: { redirect?: string }) {
  const href = (params: Record<string, string>) => {
    const query = new URLSearchParams({
      ...params,
      ...(redirect && { redirect }),
    }).toString()
    return query ? `/preview/login?${query}` : "/preview/login"
  }
  return (
    <div className="mt-8 space-y-2 rounded-lg border border-dashed border-muted-foreground/40 p-4 text-sm">
      <p className="font-medium text-foreground">Preview</p>
      <a href={href({ account: "new" })} className="block underline">
        Sign in as a new test account
      </a>
      <a href={href({})} className="block underline">
        Sign in as {demoAdmin.email}
      </a>
    </div>
  )
}
