import { Link } from "@tanstack/react-router"
import { Mark } from "@/components/identity"

type Props = {
  token: string
  showSignIn?: boolean
}

export function GuestAttribution({ token, showSignIn = true }: Props) {
  return (
    <div className="order-first mr-2 flex items-center gap-1.5 self-center text-xs font-(--ui-font) text-(--color-gray-60)">
      <Mark className="h-3 w-3 shrink-0 text-(--color-gray-50)" />
      <span>Made with Excaliself</span>
      {showSignIn && (
        <>
          <span aria-hidden="true">·</span>
          <Link
            to="/login"
            search={{ redirect: `/share/${token}` }}
            className="font-medium text-(--color-primary) hover:underline"
          >
            Sign in
          </Link>
        </>
      )}
    </div>
  )
}
