import { Link } from "@tanstack/react-router"
import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

/** The stored scene can't be read, so the room refuses to open: edits would be lost. */
export function DrawingDamaged() {
  return (
    <AuthPage
      title="This drawing can't be opened"
      subtitle="Its saved data is damaged, so it can't be edited live. Let the drawing's owner know."
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
