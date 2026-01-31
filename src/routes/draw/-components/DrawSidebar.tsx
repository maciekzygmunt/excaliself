import { Link } from "@tanstack/react-router"
import { File, Folder, LogOut, Plus, Settings } from "lucide-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CreateRow, TreeNodeItem } from "./FileTreeItem"
import type { ConfirmDialog } from "./SidebarContext"
import { useSidebarContext } from "./SidebarContext"

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
}

export function DrawSidebar({ userEmail, isAdmin }: DrawSidebarProps) {
  const {
    tree,
    dropTarget,
    onDragOver,
    onDragLeave,
    onDrop,
    confirmDialog,
    closeConfirmDialog,
  } = useSidebarContext()

  const [createType, setCreateType] = useState<"drawing" | "folder" | null>(
    null,
  )

  return (
    <>
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
              <DropdownMenuContent
                align="start"
                className="w-48"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuItem onClick={() => setCreateType("drawing")}>
                  <File className="mr-2 h-4 w-4" />
                  New Drawing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreateType("folder")}>
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
              <div
                className={cn(
                  "min-h-[200px] rounded-md transition-colors pb-8",
                  dropTarget?.type === "root" &&
                    "bg-sidebar-accent ring-2 ring-sidebar-ring",
                )}
                onDragOver={onDragOver({ type: "root" })}
                onDragLeave={onDragLeave}
                onDrop={onDrop({ type: "root" })}
              >
                <SidebarMenu>
                  {createType && (
                    <CreateRow
                      type={createType}
                      onClose={() => setCreateType(null)}
                    />
                  )}
                  {tree.map((node) => (
                    <TreeNodeItem
                      key={
                        node.type === "folder"
                          ? node.folder.id
                          : node.drawing.id
                      }
                      node={node}
                    />
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
                      await authClient.signOut()
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
      <ConfirmDeleteDialog
        dialog={confirmDialog}
        onClose={closeConfirmDialog}
      />
    </>
  )
}

function ConfirmDeleteDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialog
  onClose: () => void
}) {
  const handleConfirm = async () => {
    const action = dialog?.onConfirm
    onClose()
    if (action) {
      await action()
    }
  }

  return (
    <AlertDialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {dialog && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
