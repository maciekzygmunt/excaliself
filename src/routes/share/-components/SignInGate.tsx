import { useLoaderData, useLocation } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { DemoStart } from "@/components/demo-start"
import { SignInForm } from "@/components/sign-in-form"

type Props = {
  drawingName: string
  onSignedIn: () => void
}

/**
 * Renders on /share/<token>, not /login, so signing in keeps the URL. The
 * demo has no passwords: a new account comes back here instead.
 */
export function SignInGate({ drawingName, onSignedIn }: Props) {
  const demo = useLoaderData({
    from: "__root__",
    select: (site) => site.instanceMode === "demo",
  })
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <AuthPage
      title={
        demo
          ? "Start the demo to open this drawing"
          : "Sign in to open this drawing"
      }
      subtitle={`“${drawingName}” is shared with members of this instance`}
    >
      {demo ? (
        <DemoStart redirect={pathname} />
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
