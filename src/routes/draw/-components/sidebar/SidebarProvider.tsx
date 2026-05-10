import { createContext, type ReactNode, useContext, useMemo } from "react"
import type { ConfirmDialog } from "./use-sidebar-actions"
import { useSidebarActions } from "./use-sidebar-actions"
import { useSidebarData } from "./use-sidebar-data"
import { useSidebarDragDrop } from "./use-sidebar-drag-drop"

type SidebarContextValue = ReturnType<typeof useSidebarData> &
  ReturnType<typeof useSidebarDragDrop> &
  ReturnType<typeof useSidebarActions>

const SidebarFeatureContext = createContext<SidebarContextValue | null>(null)

/** Wraps the sidebar feature so children can read tree state and dispatch
 * mutations without prop-drilling. Composes three focused hooks. */
export function SidebarContextProvider({ children }: { children: ReactNode }) {
  const data = useSidebarData()
  const dragDrop = useSidebarDragDrop({
    drawings: data.drawings,
    foldersById: data.foldersById,
  })
  const actions = useSidebarActions({ drawings: data.drawings })

  const value = useMemo<SidebarContextValue>(
    () => ({ ...data, ...dragDrop, ...actions }),
    [data, dragDrop, actions],
  )

  return (
    <SidebarFeatureContext.Provider value={value}>
      {children}
    </SidebarFeatureContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarFeatureContext)
  if (!context) {
    throw new Error(
      "useSidebarContext must be used within SidebarContextProvider",
    )
  }
  return context
}

export type { ConfirmDialog }
