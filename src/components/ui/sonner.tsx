import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useResolvedTheme } from "@/hooks/use-theme"

const Toaster = ({ ...props }: ToasterProps) => {
  // Follows the applied app theme, so toasts match the chrome even while
  // the OS preference disagrees with an explicit Light/Dark choice.
  const theme = useResolvedTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "10px",
          "--font-size": "0.8125rem",
          "--box-shadow": "var(--popover-shadow)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
