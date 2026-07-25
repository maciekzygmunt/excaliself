import { Link } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

/**
 * The one page every dead token gets (spec §1.4) — never-existed, stopped,
 * regenerated-away, and trashed are deliberately indistinguishable, so
 * nothing leaks about whether a drawing exists. No drawing name, and no
 * sign-in gate: no session could revive this link.
 */
export function DeadLink() {
  return (
    <AuthPage
      title="This link is no longer active"
      subtitle="It may have been turned off or replaced by the drawing's owner."
    >
      <Button
        render={<Link to="/" />}
        nativeButton={false}
        variant="outline"
        className="w-full"
      >
        Go to Excaliself
      </Button>
    </AuthPage>
  )
}
