import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

type Props = {
  /** Re-runs the loader; the limit clears on its own within the minute. */
  onRetry: () => void
}

/**
 * The share page's answer to a tripped validation limit (spec §4.5), served
 * with a 429. Like the room-full state and unlike the dead link, it is worth
 * retrying — and it says nothing about the token, which was never looked up.
 */
export function TooManyRequests({ onRetry }: Props) {
  return (
    <AuthPage
      title="Too many attempts"
      subtitle="This network has opened a lot of links just now. Try again in a minute."
    >
      <Button type="button" className="w-full" onClick={onRetry}>
        Try again
      </Button>
    </AuthPage>
  )
}
