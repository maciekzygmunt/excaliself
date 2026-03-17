import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ChevronRight,
  File,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { createDrawing, updateDrawing } from '@/server/drawings'
import { createFolder, updateFolder } from '@/server/folders'
import { hasActiveDrawing } from '../-utils/hasActiveDrawing'
import {
  type Drawing,
  type DropTarget,
  type FolderType,
  type TreeNode,
  useSidebarContext,
} from './SidebarContext'

type FolderItemProps = {
  folder: FolderType
  children: TreeNode[]
}

export function FolderItem({ folder, children: childNodes }: FolderItemProps) {
  const { id: currentDrawingId } = useParams({ from: '/draw/$id' })
  const {
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onDeleteFolder,
  } = useSidebarContext()

  const queryClient = useQueryClient()
  const renameMutation = useMutation({
    mutationFn: updateFolder,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      const previous = queryClient.getQueryData<FolderType[]>(['folders'])
      queryClient.setQueryData<FolderType[]>(['folders'], (old = []) =>
        old.map((f) =>
          f.id === variables.data.id
            ? { ...f, name: variables.data.name ?? f.name }
            : f,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['folders'], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)
  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)
  const suppressBlurRef = useRef(false)

  const hasChildren = childNodes.length > 0
  const showDropHighlight =
    dropTarget?.type === 'folder' &&
    dropTarget.id === folder.id &&
    dropTarget.position === 'inside'

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== folder.name) {
      renameMutation.mutate({
        data: { id: folder.id, name: renameValue.trim() },
      })
    }
    setIsRenaming(false)
  }, [renameValue, folder.name, folder.id, renameMutation])

  const handleRenameBlur = useCallback(() => {
    if (suppressBlurRef.current) {
      renameInputRef.current?.focus()
      return
    }
    handleRenameSubmit()
  }, [handleRenameSubmit])

  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  const handleDragStart = (e: DragEvent) => {
    onDragStart({ type: 'folder', id: folder.id })(e)
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    onDragEnd()
    setIsDragging(false)
  }

  const handleDrop = (target: DropTarget) => (e: DragEvent) => {
    onDrop(target)(e)
    setIsExpanded(true)
  }

  const dropTargetProps = {
    onDragOver: onDragOver({
      type: 'folder' as const,
      id: folder.id,
      position: 'inside' as const,
    }),
    onDragLeave,
    onDrop: handleDrop({
      type: 'folder',
      id: folder.id,
      position: 'inside',
    }),
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} asChild>
      <SidebarMenuItem
        className={cn(
          'rounded-[6px] transition-all duration-200',
          showDropHighlight &&
            'bg-sidebar-accent/50 ring-1 ring-sidebar-border',
        )}
      >
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              'group/folder-row relative flex w-full rounded-[6px] transition-all duration-200',
              isDragging && 'opacity-40 scale-[0.98]',
            )}
            {...dropTargetProps}
          >
            <SidebarMenuButton
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={cn(
                'cursor-pointer active:cursor-grabbing px-2.5 py-1.5 h-auto text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors',
              )}
            >
              <ChevronRight
                className={cn(
                  'transition-transform duration-150 w-3.5 h-3.5 opacity-50',
                  isExpanded && 'rotate-90',
                  !hasChildren && 'opacity-0',
                )}
              />
              <Folder className="w-4 h-4 opacity-70" strokeWidth={2} />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  aria-label="Rename folder"
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 w-full bg-background border border-input rounded-[4px] px-1.5 text-[13px] text-foreground focus:outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/50"
                />
              ) : (
                <span className="truncate">{folder.name}</span>
              )}
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  className={cn(
                    'transition-all duration-150 md:opacity-0 group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100 data-[state=open]:opacity-100 text-muted-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-[4px] mr-1',
                    isRenaming && 'hidden',
                  )}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
                  <span className="sr-only">More options</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                className="w-48 rounded-xl border-border shadow-sm p-1"
                onCloseAutoFocus={(event) => {
                  if (!pendingRenameFocus.current) return
                  event.preventDefault()
                  pendingRenameFocus.current = false
                  requestAnimationFrame(() => {
                    renameInputRef.current?.focus()
                    renameInputRef.current?.select()
                  })
                }}
              >
                <DropdownMenuItem
                  onClick={() => {
                    suppressBlurRef.current = true
                    setTimeout(() => {
                      suppressBlurRef.current = false
                    }, 300)
                    pendingRenameFocus.current = true
                    setRenameValue(folder.name)
                    setIsRenaming(true)
                  }}
                  className="text-[13px] rounded-lg py-2 cursor-pointer focus:bg-accent"
                >
                  <Pencil
                    className="mr-2 h-4 w-4 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border my-1" />
                <DropdownMenuItem
                  onClick={() => onDeleteFolder(folder.id, hasChildren)}
                  className="text-[13px] text-destructive rounded-lg py-2 cursor-pointer focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" strokeWidth={2} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub
            className="ml-5 pl-2 border-l border-sidebar-border mr-0 pr-0 my-0.5"
            {...dropTargetProps}
          >
            {childNodes.map((node) => (
              <TreeNodeItem
                key={node.type === 'folder' ? node.folder.id : node.drawing.id}
                node={node}
                isSubItem={true}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

type DrawingItemProps = {
  drawing: Drawing
  isSubItem?: boolean
}

export function DrawingItem({ drawing, isSubItem }: DrawingItemProps) {
  const { id: currentDrawingId } = useParams({ from: '/draw/$id' })
  const { onDragStart, onDragEnd, onDeleteDrawing } = useSidebarContext()

  const queryClient = useQueryClient()
  const renameMutation = useMutation({
    mutationFn: updateDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['drawings'] })
      const previous = queryClient.getQueryData<Drawing[]>(['drawings'])
      queryClient.setQueryData<Drawing[]>(['drawings'], (old = []) =>
        old.map((d) =>
          d.id === variables.data.id
            ? { ...d, name: variables.data.updateData.name ?? d.name }
            : d,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['drawings'], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
      queryClient.invalidateQueries({ queryKey: ['drawing', drawing.id] })
    },
  })

  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(drawing.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)
  const suppressBlurRef = useRef(false)

  const isActive = drawing.id === currentDrawingId

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== drawing.name) {
      renameMutation.mutate({
        data: { id: drawing.id, updateData: { name: renameValue.trim() } },
      })
    }
    setIsRenaming(false)
  }, [renameValue, drawing.name, drawing.id, renameMutation])

  const handleRenameBlur = useCallback(() => {
    if (suppressBlurRef.current) {
      renameInputRef.current?.focus()
      return
    }
    handleRenameSubmit()
  }, [handleRenameSubmit])

  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  const ButtonContent = (
    <>
      <File
        className={cn(
          'w-4 h-4',
          isActive ? 'text-brand' : 'opacity-70',
        )}
        strokeWidth={2}
      />
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          aria-label="Rename drawing"
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') setIsRenaming(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-full bg-background border border-input rounded-[4px] px-1.5 text-[13px] text-foreground focus:outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/50"
        />
      ) : (
        <span className="truncate">{drawing.name}</span>
      )}
    </>
  )

  const dragProps = {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      onDragStart({ type: 'drawing', id: drawing.id })(e)
      setIsDragging(true)
    },
    onDragEnd: () => {
      onDragEnd()
      setIsDragging(false)
    },
  }

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          className={cn(
            'transition-all duration-150 md:opacity-0 group-hover/drawing-item:opacity-100 group-focus-within/drawing-item:opacity-100 data-[state=open]:opacity-100 text-muted-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-[4px] mr-1',
            isRenaming && 'hidden',
          )}
        >
          <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
          <span className="sr-only">More options</span>
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        className="w-48 rounded-xl border-border shadow-sm p-1"
        onCloseAutoFocus={(event) => {
          if (!pendingRenameFocus.current) return
          event.preventDefault()
          pendingRenameFocus.current = false
          requestAnimationFrame(() => {
            renameInputRef.current?.focus()
            renameInputRef.current?.select()
          })
        }}
      >
        <DropdownMenuItem
          onClick={() => {
            suppressBlurRef.current = true
            setTimeout(() => {
              suppressBlurRef.current = false
            }, 300)
            pendingRenameFocus.current = true
            setRenameValue(drawing.name)
            setIsRenaming(true)
          }}
          className="text-[13px] rounded-lg py-2 cursor-pointer focus:bg-accent"
        >
          <Pencil
            className="mr-2 h-4 w-4 text-muted-foreground"
            strokeWidth={2}
          />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border my-1" />
        <DropdownMenuItem
          onClick={() => onDeleteDrawing(drawing.id)}
          className="text-[13px] text-destructive rounded-lg py-2 cursor-pointer focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" strokeWidth={2} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const activeClasses = isActive
    ? 'relative bg-sidebar-accent text-sidebar-accent-foreground font-semibold before:absolute before:left-0.5 before:top-1/2 before:-translate-y-1/2 before:h-3.5 before:w-[3px] before:rounded-full before:bg-brand'
    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'

  if (isSubItem) {
    return (
      <SidebarMenuSubItem
        className={cn(
          'group/drawing-item relative rounded-[6px] transition-all duration-200',
          isDragging && 'opacity-40 scale-[0.98]',
        )}
        {...dragProps}
      >
        <SidebarMenuSubButton
          asChild={!isRenaming}
          isActive={isActive}
          className={cn(
            'cursor-pointer active:cursor-grabbing px-2.5 py-1.5 h-auto text-[13px] transition-colors pr-8',
            activeClasses,
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground', // Ensure Shadcn's internal styling doesn't override
          )}
        >
          {isRenaming ? (
            ButtonContent
          ) : (
            <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
              {ButtonContent}
            </Link>
          )}
        </SidebarMenuSubButton>
        {actions}
      </SidebarMenuSubItem>
    )
  }

  return (
    <SidebarMenuItem
      className={cn(
        'group/drawing-item relative rounded-[6px] transition-all duration-200',
        isDragging && 'opacity-40 scale-[0.98]',
      )}
      {...dragProps}
    >
      <SidebarMenuButton
        asChild={!isRenaming}
        isActive={isActive}
        className={cn(
          'cursor-pointer active:cursor-grabbing px-2.5 py-1.5 h-auto text-[13px] transition-colors',
          activeClasses,
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground', // Ensure Shadcn's internal styling doesn't override
        )}
      >
        {isRenaming ? (
          ButtonContent
        ) : (
          <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
            {ButtonContent}
          </Link>
        )}
      </SidebarMenuButton>
      {actions}
    </SidebarMenuItem>
  )
}

type CreateRowProps = {
  type: 'drawing' | 'folder'
  onClose: () => void
}

export function CreateRow({ type, onClose }: CreateRowProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(
    type === 'drawing' ? 'Untitled' : 'New folder',
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const submitted = useRef(false)

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['drawings'] })
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSubmit = async () => {
    if (submitted.current) return
    submitted.current = true

    const trimmed = name.trim()
    if (!trimmed) {
      onClose()
      return
    }

    if (type === 'drawing') {
      const newId = await createDrawingMutation.mutateAsync({
        data: { name: trimmed },
      })
      onClose()
      navigate({ to: '/draw/$id', params: { id: newId } })
    } else {
      await createFolderMutation.mutateAsync({
        data: { name: trimmed, parentId: null },
      })
      onClose()
    }
  }

  return (
    <SidebarMenuItem className="rounded-[6px]">
      <SidebarMenuButton className="px-2.5 py-1.5 h-auto hover:bg-sidebar-accent text-sidebar-foreground text-[13px]">
        {type === 'folder' ? (
          <Folder className="w-4 h-4 opacity-70" strokeWidth={2} />
        ) : (
          <File className="w-4 h-4 opacity-70" strokeWidth={2} />
        )}
        <input
          ref={inputRef}
          value={name}
          aria-label={type === 'drawing' ? 'New drawing name' : 'New folder name'}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          className="h-6 w-full bg-background border border-input rounded-[4px] px-1.5 text-[13px] text-foreground focus:outline-none focus:border-ring focus:ring-[2px] focus:ring-ring/50"
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function TreeNodeItem({
  node,
  isSubItem,
}: {
  node: TreeNode
  isSubItem?: boolean
}) {
  if (node.type === 'folder') {
    // Note: Folders are top-level constructs in this simple tree for now
    return <FolderItem folder={node.folder} children={node.children} />
  }
  return <DrawingItem drawing={node.drawing} isSubItem={isSubItem} />
}
