import { useMatchRoute } from "@tanstack/react-router"
import { PanelLeft } from "lucide-react"
import { KEYCAP_CLASS } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// Floating panel toggle in the content area's top-left, shown only while the
// sidebar is collapsed — once it's open, closing is handled from the sidebar
// itself (issue app-shell-fixes/01). Rendered once in the shell so Home,
// All drawings, and future non-draw pages are all covered. The draw page
// portals its own toggle into Excalidraw's top-left menu (TopLeftControls),
// so this button bows out there to avoid doubling up.
export function SidebarReopenButton() {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar()
  const matchRoute = useMatchRoute()

  if (matchRoute({ to: "/draw/$id" })) return null

  // On mobile the sidebar is an offcanvas sheet and `state` keeps tracking
  // the desktop sidebar — gate on the sheet being closed instead.
  const collapsed = isMobile ? !openMobile : state === "collapsed"
  if (!collapsed) return null

  // Geometry constraint: pages start their content at px-6 py-8 (24px/32px),
  // and on narrow viewports (or mobile, where this shows whenever the sheet is
  // closed) the heading hugs that edge. The 28px button must end above y=32 so
  // it never paints over the heading — 6px offsets keep it clear.
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Open Sidebar"
      title="Open Sidebar"
      className={cn(
        KEYCAP_CLASS,
        "absolute top-1.5 left-1.5 z-20 flex size-7 items-center justify-center text-muted-foreground transition-[border-color,scale,color] hover:text-foreground",
      )}
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  )
}
