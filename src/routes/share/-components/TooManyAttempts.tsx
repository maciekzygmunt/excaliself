import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

type Props = {
  onRetry: () => void
}

/** Rate-limited; says nothing about the token, which was never looked up. */
export function TooManyAttempts({ onRetry }: Props) {
  return (
    <AuthPage
      title={m.guest_throttled_title()}
      subtitle={m.guest_throttled_subtitle()}
    >
      <Button type="button" className="w-full" onClick={onRetry}>
        {m.guest_try_again()}
      </Button>
    </AuthPage>
  )
}
