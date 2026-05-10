import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

// While a Radix dropdown is closing, its menu items briefly steal focus from
// the rename input via blur. We suppress blur for this window so the rename
// input stays focused after the user clicks "Rename".
const DROPDOWN_BLUR_SUPPRESSION_MS = 300

type Options = {
  onSubmit: (newValue: string) => void
}

/**
 * Inline rename UI shared by folder and drawing rows in the sidebar tree.
 *
 * Returns props to spread on the input + a `start` function for the menu
 * trigger and `onMenuCloseAutoFocus` for the dropdown's close handler. The
 * dropdown handlers coordinate so focus moves cleanly into the input on open.
 */
export function useInlineRename({ onSubmit }: Options) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [value, setValue] = useState("")

  const inputRef = useRef<HTMLInputElement | null>(null)
  const suppressBlurRef = useRef(false)
  const pendingFocusRef = useRef(false)

  const submit = useCallback(() => {
    onSubmit(value)
    setIsRenaming(false)
  }, [onSubmit, value])

  const handleBlur = useCallback(() => {
    if (suppressBlurRef.current) {
      inputRef.current?.focus()
      return
    }
    submit()
  }, [submit])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") submit()
      if (e.key === "Escape") setIsRenaming(false)
    },
    [submit],
  )

  // When the user clicks "Rename", suppress the imminent blur and focus the
  // input on the next frame after the dropdown finishes closing.
  const start = useCallback((initialValue: string) => {
    suppressBlurRef.current = true
    setTimeout(() => {
      suppressBlurRef.current = false
    }, DROPDOWN_BLUR_SUPPRESSION_MS)
    pendingFocusRef.current = true
    setValue(initialValue)
    setIsRenaming(true)
  }, [])

  const onMenuCloseAutoFocus = useCallback((event: Event) => {
    if (!pendingFocusRef.current) return
    event.preventDefault()
    pendingFocusRef.current = false
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  return {
    isRenaming,
    inputProps: {
      ref: inputRef,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setValue(e.target.value),
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      onClick: (e: MouseEvent) => e.stopPropagation(),
    },
    start,
    onMenuCloseAutoFocus,
  }
}
