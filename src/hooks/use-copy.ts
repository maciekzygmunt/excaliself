import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

/** Clipboard fallback for insecure origins (self-hosted over plain HTTP). */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

/** Copies text, also where the Clipboard API is missing. False if it failed. */
export async function copyText(text: string): Promise<boolean> {
  const ok = await navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  )
  return ok || legacyCopy(text)
}

/**
 * For Copy buttons: `copied` is the key of the last copy (the text, unless
 * given), for 2s. A failed copy never shows as copied; it toasts instead.
 */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timeout.current), [])

  const copy = async (text: string, key = text) => {
    if (!(await copyText(text))) {
      toast.error("Couldn't copy — select the text and copy it manually")
      return
    }
    setCopied(key)
    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(null), 2000)
  }
  return { copied, copy }
}
