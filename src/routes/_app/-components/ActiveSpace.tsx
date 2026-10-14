// The space the sidebar shows (spec: Sidebar). On Home and All drawings the
// `space` param is the truth and switching rewrites it; elsewhere the open
// Drawing or folder sets it. Home without a param opens this device's
// last-used space.

import { useQuery } from "@tanstack/react-query"
import { useMatchRoute, useNavigate, useSearch } from "@tanstack/react-router"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { Space } from "@/db/schema"
import { currentUserQueryOptions } from "@/features/account/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"

const LAST_SPACE_KEY = "excaliself:last-space"

// localStorage can throw (privacy modes); then nothing is remembered.
function readLastSpace() {
  try {
    return window.localStorage.getItem(LAST_SPACE_KEY)
  } catch {
    return null
  }
}
function writeLastSpace(space: Space) {
  try {
    window.localStorage.setItem(LAST_SPACE_KEY, space)
  } catch {}
}

type ActiveSpaceValue = {
  /** Null while Team is hidden: one space, no switch. */
  activeSpace: Space | null
  setActiveSpace: (space: Space) => void
}

// Without the provider (component tests) Team is hidden.
const ActiveSpaceContext = createContext<ActiveSpaceValue>({
  activeSpace: null,
  setActiveSpace: () => {},
})

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const { data: teamEnabled = false } = useQuery({
    ...currentUserQueryOptions(),
    select: (user) => user.teamEnabled,
  })
  const { data: drawings = [] } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()
  const { space: param } = useSearch({ strict: false })

  const onHome = matchRoute({ to: "/draw" }) !== false
  const onBrowse = onHome || matchRoute({ to: "/drawings" }) !== false
  const openDrawing = matchRoute({ to: "/draw/$id" })
  const openFolder = matchRoute({ to: "/folder/$id" })
  const openId = openDrawing
    ? openDrawing.id
    : openFolder
      ? openFolder.id
      : null
  const openSpace = openDrawing
    ? drawings.find((d) => d.id === openDrawing.id)?.space
    : openFolder
      ? folders.find((f) => f.id === openFolder.id)?.space
      : undefined
  const browseSpace = onBrowse ? (param ?? "private") : undefined

  const decided = browseSpace ?? openSpace
  const [chosen, setChosen] = useState<Space>(() => decided ?? "private")
  // Arriving somewhere decides; a switch made there holds until the next
  // arrival (or the open item moving to Team).
  // biome-ignore lint/correctness/useExhaustiveDependencies: openId marks an arrival
  useEffect(() => {
    if (decided) setChosen(decided)
  }, [decided, openId])

  const activeSpace = teamEnabled ? (browseSpace ?? chosen) : null

  const bareHome = onHome && param === undefined
  useEffect(() => {
    if (!teamEnabled || !bareHome) return
    if (readLastSpace() === "team")
      navigate({ to: "/draw", search: { space: "team" }, replace: true })
  }, [teamEnabled, bareHome, navigate])
  useEffect(() => {
    // A bare Home is about to take the remembered space; don't overwrite it.
    if (activeSpace && !bareHome) writeLastSpace(activeSpace)
  }, [activeSpace, bareHome])

  const setActiveSpace = useCallback(
    (space: Space) => {
      setChosen(space)
      // Replace, so swipes and spring-loads don't pile up history entries.
      if (onHome) navigate({ to: "/draw", search: { space }, replace: true })
      else if (onBrowse)
        navigate({
          to: "/drawings",
          search: (prev) => ({ ...prev, space }),
          replace: true,
        })
    },
    [onHome, onBrowse, navigate],
  )

  const value = useMemo(
    () => ({ activeSpace, setActiveSpace }),
    [activeSpace, setActiveSpace],
  )
  return (
    <ActiveSpaceContext.Provider value={value}>
      {children}
    </ActiveSpaceContext.Provider>
  )
}

export function useActiveSpace() {
  return useContext(ActiveSpaceContext)
}
