import { useEffect } from "react"

export const PRODUCT_NAME = "Excaliself"

export function documentTitle(context?: string | null): string {
  return context ? `${context} — ${PRODUCT_NAME}` : PRODUCT_NAME
}

// Tab-title pattern: page context first, product last. Routes without a
// context keep the bare product name from the root head; this hook restores
// it on unmount so client-side navigation never leaves a stale title behind.
export function useDocumentTitle(context?: string | null) {
  useEffect(() => {
    document.title = documentTitle(context)
    return () => {
      document.title = documentTitle()
    }
  }, [context])
}
