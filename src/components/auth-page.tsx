import type { ReactNode } from "react"
import { AuthIllustration } from "@/components/auth-illustration"
import { Mark } from "@/components/identity"
import { useApplyTheme } from "@/hooks/use-theme"
import { TAGLINE } from "@/lib/document-title"

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

export function AuthPage({ title, subtitle, children }: Props) {
  // Logged-out pages are always light, regardless of the device's stored
  // choice — the root bootstrap script already forced it before first
  // paint; this covers SPA navigation in from a dark app.
  useApplyTheme("light")
  return (
    <div className="flex min-h-screen bg-background">
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
          {TAGLINE}
        </p>
      </div>
    </div>
  )
}
