import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react"

// When a rename is triggered from a closing dropdown, the menu briefly steals
// focus from our input. Blurs within this window are ignored so the rename
// stays open instead of submitting prematurely.
const FOCUS_GRACE_MS = 300

type Options = {
  onSubmit: (newValue: string) => void
}

/**
 * Inline rename UI shared by folder and drawing rows in the sidebar tree.
 *
 * Spread `inputProps` on the rename `<input>` and call `start(name)` from the
 * menu trigger. Pass `onMenuCloseAutoFocus` to the dropdown's
 * `onCloseAutoFocus` to avoid focus flicker when transitioning to the input.
 */
export function useInlineRename({ onSubmit }: Options) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const startedAtRef = useRef(0)

  // Sync DOM focus with `isRenaming`. We wait one frame so that the closing
  // dropdown's focus management has run before we claim focus — otherwise it
  // would steal focus right after we set it.
  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  const submit = () => {
    onSubmit(value)
    setIsRenaming(false)
  }

  return {
    isRenaming,
    start(initialValue: string) {
      startedAtRef.current = Date.now()
      setValue(initialValue)
      setIsRenaming(true)
    },
    inputProps: {
      ref: inputRef,
      value,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      onBlur: () => {
        if (Date.now() - startedAtRef.current < FOCUS_GRACE_MS) {
          inputRef.current?.focus()
          return
        }
        submit()
      },
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") submit()
        else if (e.key === "Escape") setIsRenaming(false)
      },
      onClick: (e: MouseEvent) => e.stopPropagation(),
    },
    onMenuCloseAutoFocus(e: Event) {
      if (isRenaming) e.preventDefault()
    },
  }
}
