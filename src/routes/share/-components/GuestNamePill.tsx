/**
 * Who the visitor is in this room, as an editable pill in Excalidraw's
 * top-right island beside the presence avatars (spec §1.3).
 *
 * A guest names itself: the pseudonym it arrived with is just a default, and
 * whatever it types here is what peers see and what its browser remembers.
 * A signed-in member's name comes from the session — the server refuses to
 * take one off the wire from them (§4.4) — so the pill goes read-only rather
 * than offering an edit that would silently do nothing.
 */

import { PencilIcon } from "lucide-react"
import { useRef, useState } from "react"
import {
  MAX_NAME_LENGTH,
  type ParticipantColor,
  sanitizeName,
} from "@/features/collab/protocol"
import { useDebounceCallback } from "@/hooks/use-debounce-callback"

/**
 * Long enough that a name lands as one edit rather than one broadcast per
 * keystroke, short enough that peers watch it change as it is typed.
 */
const NAME_COMMIT_DELAY_MS = 400

type Props = {
  /** The name currently announced to the room. */
  name: string
  /** This visitor's own cursor color, once the room has assigned one. */
  color: ParticipantColor | null
  /** False for signed-in members, whose name the server takes from the session. */
  editable?: boolean
  onNameChange: (name: string) => void
}

export function GuestNamePill({
  name,
  color,
  editable = true,
  onNameChange,
}: Props) {
  return (
    // No pointer-events of its own: Excalidraw hands them to the top-right
    // row's children and takes them back while the canvas is being drawn on.
    <div className="flex h-(--lg-button-size) max-w-56 items-center gap-2 rounded-(--border-radius-lg) bg-(--island-bg-color) px-3 shadow-(--shadow-island)">
      <span
        data-testid="guest-color-dot"
        className="h-2 w-2 shrink-0 rounded-full bg-(--color-gray-40)"
        // Until the room answers there is no color to wear; the neutral dot
        // above stands in so the pill doesn't resize when it arrives.
        style={color ? { backgroundColor: color.background } : undefined}
      />
      {editable ? (
        <>
          <NameField name={name} onNameChange={onNameChange} />
          {/* The affordance, not a control — the field is always live. */}
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
  // The blur and key handlers need the value as it is *now*, not as it was
  // when the render that installed them ran — Escape rewrites the draft and
  // the blur it triggers must see the rewrite.
  const draftRef = useRef(name)
  // What the name was when this edit began. Typing already reached the room
  // and this browser's storage by then, so abandoning an edit means putting
  // that name *back*, not merely clearing the field.
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
    // Nothing usable typed: the name the room already knows stands.
    if (!sanitized) return revertTo(startedFromRef.current)
    writeDraft(sanitized)
    if (sanitized !== name) onNameChange(sanitized)
  }

  return (
    // The input sizes itself to its content: the invisible ::after carries
    // the same text at the same weight, and the input lies on top of it.
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
          // Peers watch the name change as it is typed; an empty field just
          // waits rather than blanking anyone's avatar.
          if (sanitized) commit.run(sanitized)
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
          // Excalidraw binds single letters to tools; without this every
          // keystroke would also switch the active tool underneath.
          e.stopPropagation()
        }}
        className="absolute inset-0 h-full w-full truncate border-0 bg-transparent p-0 text-(--text-primary-color) shadow-none outline-none focus:ring-0"
      />
    </div>
  )
}
