import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { File, Folder } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SidebarMenuItem } from "@/components/ui/sidebar"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { createDrawing } from "@/features/drawings/server"
import { foldersQueryOptions } from "@/features/folders/queries"
import { createFolder } from "@/features/folders/server"

const DEFAULT_NAMES = {
  drawing: "Untitled",
  folder: "New folder",
} as const

type Props = {
  type: "drawing" | "folder"
  onClose: () => void
}

export function CreateRow({ type, onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState<string>(DEFAULT_NAMES[type])
  const inputRef = useRef<HTMLInputElement | null>(null)

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSettled: () => queryClient.invalidateQueries(foldersQueryOptions()),
  })

  const isPending =
    createDrawingMutation.isPending || createFolderMutation.isPending

  // Focus + select on mount, deferred a frame so the parent dropdown's
  // closing focus management runs first and doesn't steal it back.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const submit = async () => {
    if (isPending) return

    const trimmed = name.trim()
    if (!trimmed) {
      onClose()
      return
    }

    if (type === "drawing") {
      const newId = await createDrawingMutation.mutateAsync({
        data: { name: trimmed },
      })
      onClose()
      navigate({ to: "/draw/$id", params: { id: newId } })
      return
    }

    await createFolderMutation.mutateAsync({
      data: { name: trimmed, parentId: null },
    })
    onClose()
  }

  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-2 py-1">
        {type === "folder" ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-notion-gold" />
        ) : (
          <File className="h-3.25 w-3.25 shrink-0 text-muted-foreground/30" />
        )}
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            }
          }}
          className="h-6 flex-1 rounded px-2 text-sm"
        />
      </div>
    </SidebarMenuItem>
  )
}
