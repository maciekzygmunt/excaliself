import { useNavigate } from "@tanstack/react-router"
import { File, Folder } from "lucide-react"
import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SidebarMenuItem } from "@/components/ui/sidebar"
import { useCreateDrawing } from "@/features/drawings/mutations"
import { useCreateFolder } from "@/features/folders/mutations"
import { useDeferredFocusSelect } from "@/hooks/use-deferred-focus-select"

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
  const [name, setName] = useState<string>(DEFAULT_NAMES[type])
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Synchronous guard: Enter often blurs the input on the same tick, so
  // onKeyDown + onBlur can race before isPending updates. A ref lets us
  // short-circuit the second call without waiting for a re-render.
  const submittedRef = useRef(false)

  const createDrawingMutation = useCreateDrawing()
  const createFolderMutation = useCreateFolder()

  useDeferredFocusSelect(inputRef)

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
