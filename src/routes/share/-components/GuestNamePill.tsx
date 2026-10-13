import { PencilIcon } from "lucide-react"
import { useRef, useState } from "react"
import {
  MAX_NAME_LENGTH,
  type ParticipantColor,
  sanitizeName,
} from "@/features/collab/protocol"
import { useDebounceCallback } from "@/hooks/use-debounce-callback"
import { cn } from "@/lib/utils"

const NAME_COMMIT_DELAY_MS = 400

type Props = {
  name: string
  color: ParticipantColor | null
  /** False for members: the server takes their name from the session. */
  editable?: boolean
  onNameChange: (name: string) => void
  className?: string
}

export function GuestNamePill({
  name,
  color,
  editable = true,
  onNameChange,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex h-(--lg-button-size) max-w-56 items-center gap-2 rounded-(--border-radius-lg) bg-(--island-bg-color) px-3 shadow-(--shadow-island)",
        className,
      )}
    >
      <span
        data-testid="guest-color-dot"
        className="h-2 w-2 shrink-0 rounded-full bg-(--color-gray-40)"
        style={color ? { backgroundColor: color.background } : undefined}
      />
      {editable ? (
        <>
          <NameField name={name} onNameChange={onNameChange} />
          <PencilIcon
            aria-hidden="true"
            className="h-3 w-3 shrink-0 text-(--color-gray-50)"
          />
        </>
      ) : (
        <span
          className="truncate text-[0.8125rem] font-medium text-(--text-primary-color)"
          title={name}
        >
          {name}
        </span>
      )}
    </div>
  )
}

function NameField({
  name,
  onNameChange,
}: {
  name: string
  onNameChange: (name: string) => void
}) {
  const [draft, setDraft] = useState(name)
  // Escape rewrites the draft and the blur it triggers must see it.
  const draftRef = useRef(name)
  // Typing already reached the room, so abandoning an edit restores this.
  const startedFromRef = useRef(name)
  const commit = useDebounceCallback(onNameChange, NAME_COMMIT_DELAY_MS)

  const writeDraft = (value: string) => {
    draftRef.current = value
    setDraft(value)
  }

  const revertTo = (value: string) => {
    commit.cancel()
    writeDraft(value)
    if (value !== name) onNameChange(value)
  }

  const handleBlur = () => {
    commit.cancel()
    const sanitized = sanitizeName(draftRef.current)
    if (!sanitized) return revertTo(startedFromRef.current)
    writeDraft(sanitized)
    if (sanitized !== name) onNameChange(sanitized)
  }

  return (
    // Auto-width: the invisible ::after carries the same text under the input.
    <div
      className="relative min-w-0 text-[0.8125rem] font-medium after:invisible after:block after:min-w-14 after:max-w-40 after:truncate after:whitespace-pre after:content-[attr(data-value)]"
      data-value={draft}
    >
      <input
        aria-label="Your name"
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          writeDraft(e.target.value)
          const sanitized = sanitizeName(e.target.value)
          // Cancel on empty so a deleted name can't land after the debounce.
          if (sanitized) commit.run(sanitized)
          else commit.cancel()
        }}
        onFocus={() => {
          startedFromRef.current = name
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            revertTo(startedFromRef.current)
            e.currentTarget.blur()
          }
          // Excalidraw binds single letters to tools.
          e.stopPropagation()
        }}
        className="absolute inset-0 h-full w-full truncate border-0 bg-transparent p-0 text-(--text-primary-color) shadow-none outline-none focus:ring-0"
      />
    </div>
  )
}
