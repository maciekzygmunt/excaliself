import { Link } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

/** One page for every dead token, so nothing leaks about whether it existed. */
export function DeadLink() {
  return (
    <AuthPage title={m.guest_dead_title()} subtitle={m.guest_dead_subtitle()}>
      <Button
        render={<Link to="/" />}
        nativeButton={false}
        variant="outline"
        className="w-full"
      >
        {m.guest_go_home()}
      </Button>
    </AuthPage>
  )
}
