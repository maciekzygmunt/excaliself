import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        // A keycap in miniature: lifted face with a crisp bottom edge, so
        // it reads as a key on any Etched surface. Deliberately quiet —
        // small, regular weight, faded text — it's a hint, not a control.
        "pointer-events-none inline-flex h-4.5 w-fit min-w-4.5 items-center justify-center gap-1 rounded border border-border bg-keycap-from px-1 font-sans text-[10px] font-normal text-muted-foreground/70 shadow-kbd select-none dark:border-white/10",
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
