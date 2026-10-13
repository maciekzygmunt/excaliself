import { AuthPage } from "@/components/auth-page"
import { SignInForm } from "@/components/sign-in-form"

type Props = {
  drawingName: string
  onSignedIn: () => void
}

/** Renders on /share/<token>, not /login, so signing in keeps the URL. */
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
