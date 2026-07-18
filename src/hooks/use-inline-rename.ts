import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useRef,
  useState,
} from "react"
import { useDeferredFocusSelect } from "./use-deferred-focus-select"

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

  useDeferredFocusSelect(inputRef, isRenaming)

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
