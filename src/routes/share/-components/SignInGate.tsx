import { AuthPage } from "@/components/auth-page"
import { SignInForm } from "@/components/sign-in-form"

type Props = {
  drawingName: string
  /** Revalidates the share route in place — see the note below. */
  onSignedIn: () => void
}

/**
 * What a members-only link shows a visitor without a session (spec §1.4).
 * The gate renders *on* /share/<token> rather than redirecting to /login:
 * signing in revalidates the loader, which now sees the session cookie and
 * hands back the canvas — the visitor never leaves the URL they opened.
 */
export function SignInGate({ drawingName, onSignedIn }: Props) {
  return (
    <AuthPage
      title="Sign in to open this drawing"
      subtitle={`“${drawingName}” is shared with members of this instance`}
    >
      <SignInForm onSignedIn={onSignedIn}>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          You'll return to the drawing right after signing in.
        </p>
      </SignInForm>
    </AuthPage>
  )
}
