import { AuthPage } from "@/components/auth-page"
import { DemoStart } from "@/components/demo-start"
import { SignInForm } from "@/components/sign-in-form"

type Props = {
  drawingName: string
  /** Set in the demo, which has no passwords: a new account comes back here. */
  demoReturnPath?: string
  onSignedIn: () => void
}

/** Renders on /share/<token>, not /login, so signing in keeps the URL. */
export function SignInGate({ drawingName, demoReturnPath, onSignedIn }: Props) {
  return (
    <AuthPage
      title={
        demoReturnPath
          ? "Start the demo to open this drawing"
          : "Sign in to open this drawing"
      }
      subtitle={`“${drawingName}” is shared with members of this instance`}
    >
      {demoReturnPath ? (
        <DemoStart redirect={demoReturnPath} />
      ) : (
        <SignInForm onSignedIn={onSignedIn}>
          <p className="pt-2 text-center text-xs text-muted-foreground">
            You'll return to the drawing right after signing in.
          </p>
        </SignInForm>
      )}
    </AuthPage>
  )
}
