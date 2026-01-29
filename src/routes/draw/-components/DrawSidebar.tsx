import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { File, Folder, LogOut, Plus, Settings } from "lucide-react"
import { useMemo, useState } from "react"
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
import { createDrawing, deleteDrawing, getDrawings } from "@/server/drawings"
import { deleteFolder } from "@/server/folders"
import { CreateRow, TreeNodeItem } from "./FileTreeItem"
import type { ConfirmDialog, Drawing, FolderType } from "./SidebarContext"
import { SidebarContextProvider } from "./SidebarContext"
import { useSidebarState } from "./useSidebarState"

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
}

export function DrawSidebar({ userEmail, isAdmin }: DrawSidebarProps) {
  const state = useSidebarState()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings"],
    queryFn: () => getDrawings(),
  })

  const [createType, setCreateType] = useState<"drawing" | "folder" | null>(
    null,
  )
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  const deleteDrawingMutation = useMutation({
    mutationFn: deleteDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["drawings"] })
      const previous = queryClient.getQueryData<Drawing[]>(["drawings"])
      queryClient.setQueryData<Drawing[]>(["drawings"], (old = []) =>
        old.filter((d) => d.id !== variables.data),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["drawings"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["folders"] })
      const previous = queryClient.getQueryData<FolderType[]>(["folders"])
      queryClient.setQueryData<FolderType[]>(["folders"], (old = []) =>
        old.filter((f) => f.id !== variables.data),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["folders"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] })
    },
  })

  const onDeleteDrawing = (id: string) => {
    setConfirmDialog({
      title: "Delete drawing?",
      description: "Are you sure you want to delete this drawing?",
      onConfirm: async () => {
        await deleteDrawingMutation.mutateAsync({ data: id })

        if (id === currentDrawingId) {
          const remaining = drawings.filter((d) => d.id !== id)
          if (remaining.length > 0) {
            navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
          } else {
            const newId = await createDrawingMutation.mutateAsync({ data: {} })
            navigate({ to: "/draw/$id", params: { id: newId } })
          }
        }
      },
    })
  }

  const onDeleteFolder = (id: string, hasChildren: boolean) => {
    setConfirmDialog({
      title: "Delete folder?",
      description: hasChildren
        ? "This folder contains items. Delete folder and move items to root?"
        : "Delete this folder?",
      onConfirm: async () => {
        await deleteFolderMutation.mutateAsync({ data: id })
      },
    })
  }

  const contextValue = useMemo(
    () => ({
      tree: state.tree,
      dropTarget: state.dropTarget,
      onDragStart: state.onDragStart,
      onDragEnd: state.onDragEnd,
      onDragOver: state.onDragOver,
      onDragLeave: state.onDragLeave,
      onDrop: state.onDrop,
      onDeleteDrawing,
      onDeleteFolder,
      onRename: state.onRename,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  )

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
                  state.dropTarget?.type === "root" &&
                    "bg-sidebar-accent ring-2 ring-sidebar-ring",
                )}
                onDragOver={state.onDragOver({ type: "root" })}
                onDragLeave={state.onDragLeave}
                onDrop={state.onDrop({ type: "root" })}
              >
                <SidebarMenu>
                  {createType && (
                    <CreateRow
                      type={createType}
                      onClose={() => setCreateType(null)}
                    />
                  )}
                  {state.tree.map((node) => (
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
        onClose={() => setConfirmDialog(null)}
      />
    </SidebarContextProvider>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
