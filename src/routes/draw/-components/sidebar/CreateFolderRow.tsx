import { Folder } from "lucide-react"
import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SidebarMenuItem } from "@/components/ui/sidebar"
import { useCreateFolder } from "@/features/folders/mutations"
import { useDeferredFocusSelect } from "@/hooks/use-deferred-focus-select"

type Props = {
  onClose: () => void
}

// Inline creation is for folders only — drawings are created through the
// Create dialog (see CreateDrawingDialog).
export function CreateFolderRow({ onClose }: Props) {
  const [name, setName] = useState("New folder")
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Synchronous guard: Enter often blurs the input on the same tick, so
  // onKeyDown + onBlur can race before isPending updates. A ref lets us
  // short-circuit the second call without waiting for a re-render.
  const submittedRef = useRef(false)

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

    await createFolderMutation.mutateAsync({
      data: { name: trimmed, parentId: null },
    })
    onClose()
  }

  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-2 py-1">
        <Folder className="h-3.5 w-3.5 shrink-0 fill-iris/70 text-iris" />
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
