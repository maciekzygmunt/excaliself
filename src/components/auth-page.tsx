import type { ReactNode } from "react"

type Props = {
  title: string
  subtitle: string
  children: ReactNode
}

export function AuthPage({ title, subtitle, children }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-notion-terracotta text-lg font-semibold text-white">
            E
          </div>
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
  )
}
