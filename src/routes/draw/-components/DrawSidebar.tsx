import { Link } from "@tanstack/react-router"
import { File, Folder, LogOut, Plus, Settings } from "lucide-react"
import { useMemo } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CreateRow, DrawingItem, FolderItem } from "./FileTreeItem"
import {
  type Drawing,
  type FolderType,
  SidebarContextProvider,
} from "./SidebarContext"
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
  const state = useSidebarState({
    drawings,
    folders,
    currentDrawingId,
  })

  const contextValue = useMemo(() => state, [state])

  return (
    <SidebarContextProvider value={contextValue}>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader className="gap-2">
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 justify-start gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    New
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => state.startCreate("drawing")}>
                  <File className="mr-2 h-4 w-4" />
                  New Drawing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => state.startCreate("folder")}>
                  <Folder className="mr-2 h-4 w-4" />
                  New Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
              <div
                className={cn(
                  "min-h-[200px] rounded-md transition-colors",
                  state.dropTarget?.type === "root" &&
                    "bg-sidebar-accent ring-2 ring-sidebar-ring",
                )}
                onDragOver={state.onDragOver({ type: "root" })}
                onDragLeave={state.onDragLeave}
                onDrop={state.onDrop({ type: "root" })}
              >
                <SidebarMenu>
                  {state.createDraft && state.createDraft.parentId === null && (
                    <CreateRow
                      type={state.createDraft.type}
                      name={state.createName}
                      onNameChange={state.setCreateName}
                      inputRef={state.createInputRef}
                      onSubmit={state.finalizeCreate}
                      onCancel={state.cancelCreate}
                    />
                  )}
                  {state.rootFolders.map((folder) => (
                    <FolderItem key={folder.id} folder={folder} />
                  ))}
                  {state.rootDrawings.map((drawing) => (
                    <DrawingItem key={drawing.id} drawing={drawing} />
                  ))}
                </SidebarMenu>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        {userEmail.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{userEmail}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {isAdmin ? "Admin" : "User"}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="top"
                  align="start"
                  sideOffset={4}
                >
                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <Settings className="mr-2 h-4 w-4" />
                          Admin Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut()
                      window.location.href = "/login"
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </SidebarContextProvider>
  )
}
