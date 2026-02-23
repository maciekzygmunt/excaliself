import { useCallback, useEffect, useRef, useState } from "react"

export function useRename(opts: {
  currentName: string
  onRename: (newName: string) => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(opts.currentName)

  const refs = useRef({
    input: null as HTMLInputElement | null,
    pendingFocus: false,
    suppressBlur: false,
  })

  const startRenaming = useCallback(() => {
    refs.current.suppressBlur = true
    setTimeout(() => {
      refs.current.suppressBlur = false
    }, 300)
    refs.current.pendingFocus = true
    setRenameValue(opts.currentName)
    setIsRenaming(true)
  }, [opts.currentName])

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== opts.currentName) {
      opts.onRename(renameValue.trim())
    }
    setIsRenaming(false)
  }, [renameValue, opts.currentName, opts.onRename])

  const handleRenameBlur = useCallback(() => {
    if (refs.current.suppressBlur) {
      refs.current.input?.focus()
      return
    }
    handleRenameSubmit()
  }, [handleRenameSubmit])

  // Focus effect
  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      refs.current.input?.focus()
      refs.current.input?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  // onCloseAutoFocus handler for DropdownMenuContent
  const handleDropdownCloseAutoFocus = useCallback((event: Event) => {
    if (!refs.current.pendingFocus) return
    event.preventDefault()
    refs.current.pendingFocus = false
    requestAnimationFrame(() => {
      refs.current.input?.focus()
      refs.current.input?.select()
    })
  }, [])

  const cancelRenaming = useCallback(() => {
    setIsRenaming(false)
  }, [])

  return {
    isRenaming,
    renameValue,
    setRenameValue,
    refs,
    startRenaming,
    cancelRenaming,
    handleRenameSubmit,
    handleRenameBlur,
    handleDropdownCloseAutoFocus,
  }
}
