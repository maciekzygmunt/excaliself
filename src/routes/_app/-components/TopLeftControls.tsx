import { PanelLeftIcon } from "lucide-react"
import { useState } from "react"

// The title hides on narrow canvases (sidebar open, or a small window), where
// it would push Excalidraw's Library button off screen.

type Props = {
  initialName: string
  /** Trashed drawings (spec §5.11): the name is shown but not editable. */
  readOnly?: boolean
  onToggleSidebar: () => void
  onSubmit: (value: string) => void
}

export function TopLeftControls({
  initialName,
  readOnly = false,
  onToggleSidebar,
  onSubmit,
}: Props) {
  return (
    <div className="pointer-events-auto flex flex-nowrap items-center gap-2.5">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="dropdown-menu-button [--button-bg:var(--color-surface-low)] [--button-width:var(--lg-button-size)] [--button-height:var(--lg-button-size)] ring-1 ring-(--color-surface-lowest) active:ring-(--color-brand-active)"
        aria-label="Toggle Sidebar"
        title="Toggle Sidebar"
      >
        <PanelLeftIcon className="h-(--lg-icon-size) w-(--lg-icon-size)" />
      </button>
      {readOnly ? (
        <span
          className="hidden max-w-45 truncate text-[0.95rem] font-semibold text-(--text-primary-color) @min-[66rem]/canvas:block"
          title={initialName}
        >
          {initialName || "Untitled Drawing"}
        </span>
      ) : (
        <RenameField initialName={initialName} onSubmit={onSubmit} />
      )}
    </div>
  )
}

function RenameField({
  initialName,
  onSubmit,
}: {
  initialName: string
  onSubmit: (value: string) => void
}) {
  // Uncontrolled — the parent resets it via the `key` prop when the cached
  // name changes. Local typing state stays here without re-rendering parents.
  const [value, setValue] = useState(initialName)

  return (
    <div className="relative max-w-45 min-w-0 overflow-hidden hidden @min-[66rem]/canvas:block">
      <div
        className="relative h-(--lg-button-size) border-b border-transparent bg-transparent font-semibold after:block after:w-full after:min-w-16 after:whitespace-pre after:invisible after:content-[attr(data-value)] focus-within:border-(--color-primary)"
        data-value={value || "Untitled Drawing"}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => {
            const trimmed = e.target.value.trim()
            if (!trimmed || trimmed === initialName) {
              setValue(initialName)
              return
            }
            onSubmit(trimmed)
          }}
          className="absolute inset-0 h-full w-full truncate bg-transparent p-0 text-[0.95rem] font-semibold text-(--text-primary-color) shadow-none outline-none focus:cursor-text focus:ring-0 hover:text-(--color-primary)"
          placeholder="Untitled Drawing"
          title="Click to rename scene"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
