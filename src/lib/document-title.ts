import { useEffect } from "react"

export const PRODUCT_NAME = "Excaliself"

// Spec §1: content titles (drawing names) join with an em dash, chrome pages
// (All drawings, Settings, …) with a middle dot.
export function documentTitle(
  context?: string | null,
  opts?: { chrome?: boolean },
): string {
  if (!context) return PRODUCT_NAME
  return `${context} ${opts?.chrome ? "·" : "—"} ${PRODUCT_NAME}`
}

// Tab-title pattern: page context first, product last. Routes without a
// context keep the bare product name from the root head; this hook restores
// it on unmount so client-side navigation never leaves a stale title behind.
export function useDocumentTitle(
  context?: string | null,
  opts?: { chrome?: boolean },
) {
  const chrome = opts?.chrome ?? false
  useEffect(() => {
    document.title = documentTitle(context, { chrome })
    return () => {
      document.title = documentTitle()
    }
  }, [context, chrome])
}
