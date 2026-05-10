import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { getDrawings } from "@/server/drawings"
import { getFolders } from "@/server/folders"
import { buildTree, filterTreeBySearch } from "./tree"

export function useSidebarData() {
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings"],
    queryFn: () => getDrawings(),
  })
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: () => getFolders(),
  })

  const [searchQuery, setSearchQuery] = useState("")

  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  )

  const tree = useMemo(() => buildTree(folders, drawings), [folders, drawings])

  const filteredTree = useMemo(() => {
    const filtered = filterTreeBySearch(drawings, searchQuery)
    return searchQuery.trim() ? filtered : tree
  }, [drawings, searchQuery, tree])

  return {
    drawings,
    folders,
    foldersById,
    tree,
    filteredTree,
    searchQuery,
    setSearchQuery,
  }
}
