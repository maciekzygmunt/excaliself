import { Link } from "@tanstack/react-router"
import { Folder, LogOut, Plus, Settings, User } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CreateRow } from "./CreateRow"
import { DrawingItem } from "./DrawingItem"
import { FolderItem } from "./FolderItem"
import { type Drawing, type FolderType, SidebarContextProvider } from "./SidebarContext"
import { useSidebarState } from "./useSidebarState"

type DrawSidebarProps = {
  drawings: Drawing[]
  folders: FolderType[]
  currentDrawingId: string
  userEmail: string
  isAdmin: boolean
}

export function DrawSidebar({
  drawings,
  folders,
  currentDrawingId,
  userEmail,
  isAdmin,
}: DrawSidebarProps) {
  const { open } = useSidebar()

  const state = useSidebarState({
    drawings,
    folders,
    currentDrawingId,
    open,
  })

  const contextValue = useMemo(
    () => ({
      ...state,
      open,
    }),
    [state, open],
  )

  return (
    <SidebarContextProvider value={contextValue}>
      <Sidebar variant="sidebar" className="border-r border-border/40">
        <SidebarHeader className="h-14 justify-center border-b border-border/40 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs font-bold">E</span>
            </div>
            {open && <span className="font-semibold text-sm">Excalidraw</span>}
          </div>
        </SidebarHeader>

        {open && (
          <div className="flex gap-2 px-4 py-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 justify-start px-2 text-xs font-normal"
              onClick={() => state.startCreate("drawing")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Drawing
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 px-0"
              title="New Folder"
              onClick={() => state.startCreate("folder")}
            >
              <Folder className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <SidebarContent className="px-2">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
          <div
            onDragOver={state.onDragOver({ type: "root" })}
            onDragLeave={state.onDragLeave}
            onDrop={state.onDrop({ type: "root" })}
            className={cn(
              "min-h-full rounded-md border border-transparent transition-all",
              state.dropTarget?.type === "root" && "bg-accent/30 ring-1 ring-primary/30",
            )}
          >
            <button
              type="button"
              onClick={() => state.setActiveFolderId(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors mb-1",
                state.activeFolderId === null
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="truncate">All Drawings</span>
            </button>

            <CreateRow depth={0} parentId={null} />
            {state.rootFolders.map((folder) => (
              <FolderItem key={folder.id} folder={folder} depth={0} />
            ))}
            {state.rootDrawings.map((item) => (
              <DrawingItem key={item.id} item={item} depth={0} />
            ))}
          </div>
        </SidebarContent>

        <SidebarFooter className="border-t border-border/40 p-4">
          <UserFooter open={open} userEmail={userEmail} isAdmin={isAdmin} />
        </SidebarFooter>
      </Sidebar>
    </SidebarContextProvider>
  )
}

function UserFooter({
  open,
  userEmail,
  isAdmin,
}: {
  open: boolean
  userEmail: string
  isAdmin: boolean
}) {
  const handleSignOut = async () => {
    await signOut()
    window.location.href = "/login"
  }

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{userEmail}</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {isAdmin ? "Admin" : "User"}
        </span>
      </div>
      <div className="flex items-center">
        {isAdmin && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Link to="/admin">
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
