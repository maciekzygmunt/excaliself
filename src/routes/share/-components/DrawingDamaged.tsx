import { Link } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

/** The stored scene can't be read, so the room refuses to open: edits would be lost. */
export function DrawingDamaged() {
  return (
    <AuthPage
      title={m.guest_damaged_title()}
      subtitle={m.guest_damaged_subtitle()}
    >
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
