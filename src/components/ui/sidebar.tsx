"use client"

import { PanelLeft } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const toggle = React.useCallback(() => setOpen((value) => !value), [])

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

export const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { variant?: "inset" | "sidebar" }
>(({ className, variant = "inset", ...props }, ref) => {
  const { open } = useSidebar()

  return (
    <aside
      ref={ref}
      data-state={open ? "open" : "collapsed"}
      className={cn(
        "fixed inset-y-3 left-3 z-40 flex h-[calc(100vh-1.5rem)] flex-col overflow-hidden transition-all duration-200 md:static md:inset-auto md:h-full",
        open
          ? "translate-x-0 w-72 opacity-100"
          : "-translate-x-full w-0 opacity-0 pointer-events-none",
        variant === "inset"
          ? "rounded-xl border bg-background shadow-sm"
          : "border-r bg-background",
        className,
      )}
      {...props}
    />
  )
})
Sidebar.displayName = "Sidebar"

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-xl border bg-background shadow-sm overflow-clip",
        className,
      )}
      {...props}
    />
  )
})
SidebarInset.displayName = "SidebarInset"

export const SidebarOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { open, setOpen } = useSidebar()

  return (
    <div
      ref={ref}
      aria-hidden={!open}
      onClick={() => setOpen(false)}
      className={cn(
        "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition md:hidden",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      {...props}
    />
  )
})
SidebarOverlay.displayName = "SidebarOverlay"

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { toggle } = useSidebar()

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={className}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"
