import { useQuery } from "@tanstack/react-query"
import { AuthPage } from "@/components/auth-page"
import { SignInForm } from "@/components/sign-in-form"
import { SsoButtons } from "@/components/sso-buttons"
import { getSignInOptions } from "@/features/auth/server"
import { m } from "@/paraglide/messages"

type Props = {
  drawingName: string
  onSignedIn: () => void
}

/** Renders on /share/<token>, not /login, so signing in keeps the URL. */
export function SignInGate({ drawingName, onSignedIn }: Props) {
  const { data } = useQuery({
    queryKey: ["auth", "signInOptions"],
    queryFn: () => getSignInOptions(),
  })
  // The share page is client-only, so location is always there.
  const here = window.location.pathname

  return (
    <AuthPage
      title={m.guest_gate_title()}
      subtitle={m.guest_gate_subtitle({ name: drawingName })}
    >
      <SsoButtons
        providers={data?.ssoProviders ?? []}
        callbackURL={here}
        // /login shows why SSO failed, then returns here.
        errorCallbackURL={`/login?${new URLSearchParams({ redirect: here })}`}
      />
      <SignInForm onSignedIn={onSignedIn}>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          {m.guest_gate_return()}
        </p>
      </SignInForm>
    </AuthPage>
  )
}
