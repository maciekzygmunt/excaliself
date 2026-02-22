import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowRight,
  ChevronDown,
  Command,
  File,
  Folder,
  Layers,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

export const Route = createFileRoute("/2")({
  component: SidebarShowcase2,
})

/**
 * Treatment 2: "Spotlight / Command Palette" — Search-first, keyboard-driven
 *
 * Aesthetic: A hybrid between a command palette and a file browser.
 * Dark, dense, monospaced accents. The search bar IS the sidebar.
 * Think Linear meets Raycast — everything is one keystroke away.
 * Electric blue accent on charcoal. Feels like a power tool.
 */

type MockItem = {
  id: string
  name: string
  type: "drawing" | "folder"
  tag?: string
  starred?: boolean
  children?: MockItem[]
  modified?: string
}

const MOCK_ITEMS: MockItem[] = [
  { id: "1", name: "Homepage wireframe", type: "drawing", tag: "design", starred: true, modified: "2m ago" },
  { id: "2", name: "User flow v3", type: "drawing", tag: "ux", starred: true, modified: "1h ago" },
  { id: "3", name: "Component library", type: "drawing", tag: "design", modified: "3h ago" },
  { id: "4", name: "Sprint 14", type: "folder", children: [
    { id: "5", name: "Login redesign", type: "drawing", tag: "sprint", modified: "1d ago" },
    { id: "6", name: "Dashboard layout", type: "drawing", tag: "sprint", modified: "1d ago" },
    { id: "7", name: "Settings page", type: "drawing", tag: "sprint", modified: "2d ago" },
  ]},
  { id: "8", name: "Brand exploration", type: "drawing", tag: "brand", modified: "3d ago" },
  { id: "9", name: "API diagram", type: "drawing", tag: "eng", modified: "1w ago" },
  { id: "10", name: "Onboarding sketches", type: "drawing", tag: "ux", modified: "1w ago" },
  { id: "11", name: "Icon set draft", type: "drawing", tag: "design", modified: "2w ago" },
]

const TAG_COLORS: Record<string, string> = {
  design: "#6C8EEF",
  ux: "#B07CE8",
  sprint: "#4CC88A",
  brand: "#E8A44C",
  eng: "#E86C6C",
}

function getAllItems(items: MockItem[]): MockItem[] {
  return items.flatMap(item =>
    item.type === "folder" && item.children
      ? [item, ...getAllItems(item.children)]
      : [item]
  )
}

function SidebarShowcase2() {
  const [activeId, setActiveId] = useState("1")
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["4"]))
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const allFlat = getAllItems(MOCK_ITEMS).filter(i => i.type === "drawing")
  const filtered = allFlat.filter(item => {
    const matchesQuery = !query || item.name.toLowerCase().includes(query.toLowerCase())
    const matchesTag = !filterTag || item.tag === filterTag
    return matchesQuery && matchesTag
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, filterTag])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      setActiveId(filtered[selectedIndex].id)
      setQuery("")
    } else if (e.key === "Escape") {
      setQuery("")
      searchRef.current?.blur()
    }
  }

  const activeItem = allFlat.find(i => i.id === activeId)

  return (
    <div className="flex h-screen w-full" style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      background: "#0F0F12",
      color: "#E8E8ED",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside className="flex flex-col h-full shrink-0 select-none" style={{
        width: 300,
        background: "#141418",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Search header — the hero */}
        <div className="p-3">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: query ? "0 0 0 1px rgba(108,142,239,0.4), 0 0 20px rgba(108,142,239,0.1)" : "none",
              transition: "box-shadow 200ms, border-color 200ms",
              borderColor: query ? "rgba(108,142,239,0.3)" : "rgba(255,255,255,0.06)",
            }}
          >
            <Search style={{ width: 14, height: 14, color: query ? "#6C8EEF" : "#555", flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search drawings..."
              className="bg-transparent border-none outline-none text-[13px] w-full"
              style={{
                color: "#E8E8ED",
                fontFamily: "'Inter', sans-serif",
                caretColor: "#6C8EEF",
              }}
            />
            {query ? (
              <button onClick={() => setQuery("")}>
                <X style={{ width: 12, height: 12, color: "#555" }} />
              </button>
            ) : (
              <div className="flex items-center gap-0.5 shrink-0">
                <kbd className="text-[10px] px-1 py-0.5 rounded"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#666" }}>
                  <Command style={{ width: 9, height: 9, display: "inline" }} />
                </kbd>
                <kbd className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#666" }}>
                  K
                </kbd>
              </div>
            )}
          </div>
        </div>

        {/* Tag filters */}
        <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
          {Object.entries(TAG_COLORS).map(([tag, color]) => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all"
              style={{
                background: filterTag === tag ? `${color}22` : "rgba(255,255,255,0.03)",
                color: filterTag === tag ? color : "#666",
                border: `1px solid ${filterTag === tag ? `${color}44` : "transparent"}`,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <Tag style={{ width: 9, height: 9 }} />
              {tag}
            </button>
          ))}
          {filterTag && (
            <button
              onClick={() => setFilterTag(null)}
              className="text-[11px] px-1.5 py-1 rounded transition-colors"
              style={{ color: "#666", fontFamily: "'Inter', sans-serif" }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="mx-3" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

        {/* Results / File list */}
        <div className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: "none" }}>
          {query ? (
            // Search results mode
            <div>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest" style={{ color: "#555" }}>
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </div>
              {filtered.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setActiveId(item.id)
                    setQuery("")
                  }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: idx === selectedIndex ? "rgba(108,142,239,0.1)" : "transparent",
                    borderLeft: idx === selectedIndex ? "2px solid #6C8EEF" : "2px solid transparent",
                  }}
                >
                  <File style={{ width: 13, height: 13, color: "#555", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate" style={{ fontFamily: "'Inter', sans-serif" }}>
                      {highlightMatch(item.name, query)}
                    </div>
                  </div>
                  {item.tag && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{
                        background: `${TAG_COLORS[item.tag]}15`,
                        color: TAG_COLORS[item.tag],
                      }}>
                      {item.tag}
                    </span>
                  )}
                  {idx === selectedIndex && (
                    <ArrowRight style={{ width: 11, height: 11, color: "#6C8EEF" }} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Browse mode
            <div>
              {/* Starred section */}
              <div className="px-2 py-1.5 flex items-center gap-1.5">
                <Star style={{ width: 10, height: 10, color: "#E8A44C", fill: "#E8A44C" }} />
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "#555" }}>
                  Starred
                </span>
              </div>
              {allFlat.filter(i => i.starred).map(item => (
                <FileRow key={item.id} item={item} isActive={activeId === item.id} onClick={() => setActiveId(item.id)} />
              ))}

              <div className="mx-2 my-2" style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

              {/* All files */}
              <div className="px-2 py-1.5 flex items-center gap-1.5">
                <Layers style={{ width: 10, height: 10, color: "#555" }} />
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "#555" }}>
                  All drawings
                </span>
              </div>
              {MOCK_ITEMS.map(item => {
                if (item.type === "folder") {
                  const isExpanded = expandedFolders.has(item.id)
                  return (
                    <div key={item.id}>
                      <div
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                        onClick={() => {
                          setExpandedFolders(prev => {
                            const next = new Set(prev)
                            if (next.has(item.id)) next.delete(item.id)
                            else next.add(item.id)
                            return next
                          })
                        }}
                        style={{}}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <ChevronDown style={{
                          width: 11,
                          height: 11,
                          color: "#555",
                          transform: isExpanded ? "rotate(0)" : "rotate(-90deg)",
                          transition: "transform 150ms",
                        }} />
                        <Folder style={{ width: 13, height: 13, color: "#7A7A85" }} />
                        <span className="text-[13px] flex-1 truncate" style={{ color: "#888", fontFamily: "'Inter', sans-serif" }}>
                          {item.name}
                        </span>
                        <span className="text-[10px]" style={{ color: "#444" }}>
                          {item.children?.length}
                        </span>
                      </div>
                      {isExpanded && item.children?.map(child => (
                        <div key={child.id} className="ml-5">
                          <FileRow item={child} isActive={activeId === child.id} onClick={() => setActiveId(child.id)} />
                        </div>
                      ))}
                    </div>
                  )
                }
                return <FileRow key={item.id} item={item} isActive={activeId === item.id} onClick={() => setActiveId(item.id)} />
              })}
            </div>
          )}
        </div>

        {/* New button + user */}
        <div className="p-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg text-[12px] transition-all"
            style={{
              background: "rgba(108,142,239,0.12)",
              color: "#6C8EEF",
              border: "1px solid rgba(108,142,239,0.2)",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(108,142,239,0.2)"
              e.currentTarget.style.borderColor = "rgba(108,142,239,0.35)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(108,142,239,0.12)"
              e.currentTarget.style.borderColor = "rgba(108,142,239,0.2)"
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            New drawing
          </button>
          <button
            className="p-2 rounded-lg transition-colors"
            style={{ color: "#555" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </aside>

      {/* Canvas */}
      <main className="flex-1 relative overflow-hidden" style={{ background: "#0F0F12" }}>
        {/* Subtle grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />

        {/* Top bar */}
        <div className="relative z-10 flex items-center gap-3 px-5 py-3">
          <Sparkles style={{ width: 12, height: 12, color: "#6C8EEF" }} />
          <span className="text-[12px]" style={{ color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>
            {activeItem?.name ?? "Untitled"}
          </span>
          {activeItem?.tag && (
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: `${TAG_COLORS[activeItem.tag]}15`,
                color: TAG_COLORS[activeItem.tag],
              }}>
              {activeItem.tag}
            </span>
          )}
          <span className="text-[11px] ml-auto" style={{ color: "#333" }}>
            {activeItem?.modified}
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(108,142,239,0.08)",
                border: "1px solid rgba(108,142,239,0.15)",
              }}>
              <Command style={{ width: 28, height: 28, color: "rgba(108,142,239,0.4)" }} />
            </div>
            <p className="text-[13px]" style={{ color: "#555", fontFamily: "'Inter', sans-serif" }}>
              Treatment 2 — Command palette
            </p>
            <p className="text-[11px] mt-1" style={{ color: "#333", fontFamily: "'Inter', sans-serif" }}>
              Search-first, keyboard-driven, Linear-inspired
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function FileRow({ item, isActive, onClick }: { item: MockItem; isActive: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-all group"
      style={{
        background: isActive ? "rgba(108,142,239,0.08)" : "transparent",
        borderLeft: isActive ? "2px solid #6C8EEF" : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent" }}
    >
      <File style={{ width: 13, height: 13, color: isActive ? "#6C8EEF" : "#444", flexShrink: 0 }} />
      <span className="text-[13px] flex-1 truncate" style={{
        color: isActive ? "#E8E8ED" : "#888",
        fontFamily: "'Inter', sans-serif",
        fontWeight: isActive ? 500 : 400,
      }}>
        {item.name}
      </span>
      {item.tag && (
        <span className="text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: `${TAG_COLORS[item.tag ?? "design"]}15`,
            color: TAG_COLORS[item.tag ?? "design"],
          }}>
          {item.tag}
        </span>
      )}
      <span className="text-[10px]" style={{ color: "#333" }}>
        {item.modified}
      </span>
    </div>
  )
}

function highlightMatch(text: string, query: string) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ color: "#6C8EEF", fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  )
}
