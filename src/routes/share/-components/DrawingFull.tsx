import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

type Props = {
  onRetry: () => void
}

/** The room hit its participant cap; unlike a dead link, worth retrying. */
export function DrawingFull({ onRetry }: Props) {
  return (
    <AuthPage
      title="This drawing is full"
      subtitle="Too many people are editing it right now. Try again in a few minutes."
    >
      <Button type="button" className="w-full" onClick={onRetry}>
        Try again
      </Button>
    </AuthPage>
  )
}
