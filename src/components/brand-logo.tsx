import { cn } from "@/lib/utils"

const sizeMap = {
  sm: "h-5 w-5 rounded text-[10px]",
  md: "h-8 w-8 rounded-lg text-sm",
  lg: "h-10 w-10 rounded-lg text-lg",
} as const

export function BrandLogo({ size = "lg" }: { size?: keyof typeof sizeMap }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-notion-terracotta font-semibold text-white",
        sizeMap[size],
      )}
    >
      E
    </div>
  )
}
