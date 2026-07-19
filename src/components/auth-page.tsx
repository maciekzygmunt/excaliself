import { type ReactNode, useState } from "react"
import { AuthIllustration } from "@/components/auth-illustration"
import { Mark } from "@/components/identity"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

// The "theme" localStorage key follows the next-themes convention, so a
// future in-app settings toggle can write the same key.
const THEME_KEY = "theme"

// Runs while the SSR'd HTML is still parsing, so a visitor who explicitly
// chose dark never sees a light flash before hydration.
const themeScript = `try{document.currentScript.parentElement.classList.toggle("dark",localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")}catch{}`

/**
 * Light by default, always — dark only when the user has explicitly chosen
 * it in settings. The OS preference is deliberately not consulted.
 */
function useExplicitTheme() {
  // Read once on the client's first render; auth pages have no toggle, so
  // no subscription is needed.
  const [dark] = useState(() => {
    try {
      return (
        typeof window !== "undefined" &&
        window.localStorage.getItem(THEME_KEY) === "dark"
      )
    } catch {
      return false
    }
  })
  return dark
}

export function AuthPage({ title, subtitle, children }: Props) {
  const dark = useExplicitTheme()
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
      <div
        data-auth-panel
        className="relative m-4 hidden overflow-hidden rounded-3xl bg-iris-muted md:flex md:flex-1"
      >
        {/* Sized on both axes so the svg letterboxes its drawing to fit —
            no cropping at narrow panel widths. */}
        <AuthIllustration className="absolute inset-0 m-auto h-[82%] w-[82%] text-iris" />
        <p className="absolute inset-x-0 bottom-8 text-center text-sm text-muted-foreground">
          Your team's whiteboard, on your server.
        </p>
      </div>
    </div>
  )
}
