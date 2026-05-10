import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { File, Folder } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SidebarMenuItem } from "@/components/ui/sidebar"
import { createDrawing } from "@/server/drawings"
import { createFolder } from "@/server/folders"

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
  const submittedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["drawings"] }),
  })

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  })

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
    if (submittedRef.current) return
    submittedRef.current = true

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
          <Folder className="h-[14px] w-[14px] shrink-0 text-notion-gold" />
        ) : (
          <File className="h-[13px] w-[13px] shrink-0 text-muted-foreground/30" />
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
