import { type ReactNode, useEffect, useState } from "react"
import { AuthIllustration } from "@/components/auth-illustration"
import { Mark } from "@/components/identity"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

const DARK_QUERY = "(prefers-color-scheme: dark)"

// Runs while the SSR'd HTML is still parsing, so a dark-OS visitor never
// sees a light flash before hydration.
const themeScript = `document.currentScript.parentElement.classList.toggle("dark",window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches)`

/**
 * Follows the OS theme. Logged-out pages have no user preference to read,
 * so unlike the in-app chrome (always Porcelain light) they track the system.
 */
function useSystemTheme() {
  // Lazy init reads the OS preference on the client's very first render, so
  // client-side navigations and pre-effect re-renders never paint light.
  const [dark, setDark] = useState<boolean | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : window.matchMedia(DARK_QUERY).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY)
    const apply = () => setDark(mql.matches)
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [])
  return dark
}

export function AuthPage({ title, subtitle, children }: Props) {
  const dark = useSystemTheme()
  return (
    <div
      suppressHydrationWarning
      className={cn("flex min-h-screen bg-background", dark && "dark")}
    >
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input
        dangerouslySetInnerHTML={{ __html: themeScript }}
      />
      <div className="flex min-h-screen w-full flex-col items-center justify-center p-4 md:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3">
            <Mark className="h-8 w-auto text-iris" />
            <div className="text-center">
              <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">
                {title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      {/* Always deep ink regardless of page theme, so it carries the dark
          iris tones — hence its own `dark` scope. */}
      <div
        data-auth-panel
        className="dark relative hidden overflow-hidden bg-deep-ink md:flex md:w-1/2"
      >
        <AuthIllustration className="absolute top-1/2 left-1/2 h-[85%] w-auto -translate-x-1/2 -translate-y-1/2 text-iris" />
        <p className="absolute bottom-8 left-8 text-sm text-deep-ink-foreground/80">
          Your team's whiteboard, on your server.
        </p>
      </div>
    </div>
  )
}
