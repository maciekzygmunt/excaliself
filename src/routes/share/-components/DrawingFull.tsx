import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

type Props = {
  /** Re-attempts the visit; the state is transient by nature. */
  onRetry: () => void
}

/**
 * The room hit its participant cap (spec §4.5) — a live link the visitor
 * simply can't get into right now. Distinct from the dead link on purpose:
 * this one is worth retrying, and the retry re-dials the room. Reached when
 * the server closes the socket with the room-full code, which the share route
 * records as ?full.
 */
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
