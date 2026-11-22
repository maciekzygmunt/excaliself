import { AuthPage } from "@/components/auth-page"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

type Props = {
  onRetry: () => void
}

/** The room hit its participant cap; unlike a dead link, worth retrying. */
export function DrawingFull({ onRetry }: Props) {
  return (
    <AuthPage title={m.guest_full_title()} subtitle={m.guest_full_subtitle()}>
      <Button type="button" className="w-full" onClick={onRetry}>
        {m.guest_try_again()}
      </Button>
    </AuthPage>
  )
}
