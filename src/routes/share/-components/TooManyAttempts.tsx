import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"

type Props = {
  onRetry: () => void
}

/** Rate-limited; says nothing about the token, which was never looked up. */
export function TooManyAttempts({ onRetry }: Props) {
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
