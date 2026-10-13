import { Link } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

/** One page for every dead token, so nothing leaks about whether it existed. */
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
