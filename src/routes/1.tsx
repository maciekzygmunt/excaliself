import { createFileRoute } from "@tanstack/react-router"
import {
  ChevronRight,
  Clock,
  File,
  Folder,
  Hash,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/1")({
  component: SidebarShowcase1,
})

/**
 * Treatment 1: "Notion-style" — Ultra-minimal, text-forward sidebar
 *
 * Aesthetic: Whisper-quiet interface that gets out of your way.
 * Relies on typography hierarchy and subtle hover reveals.
 * Monochrome with a single warm accent. Feels like a beautifully
 * typeset document rather than an app.
 */

const MOCK_ITEMS = [
  { id: "1", name: "Homepage wireframe", type: "drawing" as const, starred: true },
  { id: "2", name: "User flow v3", type: "drawing" as const, starred: true },
  { id: "3", name: "Component library", type: "drawing" as const, starred: false },
  { id: "4", name: "Sprint 14", type: "folder" as const, children: [
    { id: "5", name: "Login redesign", type: "drawing" as const, starred: false },
    { id: "6", name: "Dashboard layout", type: "drawing" as const, starred: false },
    { id: "7", name: "Settings page", type: "drawing" as const, starred: false },
  ]},
  { id: "8", name: "Archive", type: "folder" as const, children: [
    { id: "9", name: "Old landing page", type: "drawing" as const, starred: false },
  ]},
  { id: "10", name: "Brand exploration", type: "drawing" as const, starred: false },
  { id: "11", name: "API diagram", type: "drawing" as const, starred: false },
  { id: "12", name: "Onboarding sketches", type: "drawing" as const, starred: false },
]

function SidebarShowcase1() {
  const [activeId, setActiveId] = useState("1")
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["4"]))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeItem = MOCK_ITEMS.flatMap(item =>
    item.type === "folder" ? item.children ?? [] : [item]
  ).find(item => item.id === activeId) ?? MOCK_ITEMS[0]

  return (
    <div className="flex h-screen w-full" style={{
      fontFamily: "'IBM Plex Sans', 'SF Pro Text', -apple-system, sans-serif",
      background: "#FAFAF9",
    }}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside
        className="flex flex-col border-r h-full shrink-0 select-none"
        style={{
          width: 260,
          background: "#FAFAF9",
          borderColor: "rgba(0,0,0,0.06)",
        }}
      >
        {/* Workspace header */}
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group"
            style={{ transition: "background 120ms" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold text-white"
              style={{ background: "#E16B4F" }}>
              E
            </div>
            <span className="text-sm font-medium" style={{ color: "#1A1A1A", letterSpacing: "-0.01em" }}>
              Excalidraw
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pb-1">
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
            style={{
              background: searchFocused ? "rgba(0,0,0,0.04)" : "transparent",
              transition: "all 150ms",
            }}
            onMouseEnter={e => { if (!searchFocused) e.currentTarget.style.background = "rgba(0,0,0,0.03)" }}
            onMouseLeave={e => { if (!searchFocused) e.currentTarget.style.background = "transparent" }}
          >
            <Search className="shrink-0" style={{ width: 14, height: 14, color: "#999" }} />
            <input
              placeholder="Search..."
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-[#B0B0B0]"
              style={{ color: "#1A1A1A", fontFamily: "inherit" }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <kbd className="hidden group-hover:inline text-[10px] px-1 py-0.5 rounded border"
              style={{ color: "#AAA", borderColor: "rgba(0,0,0,0.08)", fontFamily: "'IBM Plex Mono', monospace" }}>
              /
            </kbd>
          </div>
        </div>

        {/* Quick access */}
        <div className="px-3 py-1">
          {[
            { icon: Clock, label: "Recent", count: 3 },
            { icon: Star, label: "Starred", count: 2 },
            { icon: Trash2, label: "Trash" },
          ].map(({ icon: Icon, label, count }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group"
              style={{ transition: "background 120ms" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Icon style={{ width: 14, height: 14, color: "#999" }} />
              <span className="text-sm flex-1" style={{ color: "#666" }}>{label}</span>
              {count && (
                <span className="text-[11px]" style={{ color: "#BBB", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {count}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-4 my-2" style={{ height: 1, background: "rgba(0,0,0,0.05)" }} />

        {/* Section label + add */}
        <div className="px-5 flex items-center justify-between py-1">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#B0B0B0" }}>
            Drawings
          </span>
          <button
            className="p-0.5 rounded opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
            style={{ color: "#999" }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "1"
              e.currentTarget.style.background = "rgba(0,0,0,0.04)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = "0"
              e.currentTarget.style.background = "transparent"
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: "none" }}>
          {MOCK_ITEMS.map(item => {
            if (item.type === "folder") {
              const isExpanded = expandedFolders.has(item.id)
              return (
                <div key={item.id}>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer group"
                    style={{ transition: "background 120ms" }}
                    onClick={() => toggleFolder(item.id)}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(0,0,0,0.03)"
                      setHoveredId(item.id)
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent"
                      setHoveredId(null)
                    }}
                  >
                    <ChevronRight
                      style={{
                        width: 12,
                        height: 12,
                        color: "#BBB",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                        transition: "transform 150ms ease",
                      }}
                    />
                    <Folder style={{ width: 14, height: 14, color: "#C4A46C" }} />
                    <span className="text-sm flex-1 truncate" style={{ color: "#444" }}>
                      {item.name}
                    </span>
                    <MoreHorizontal
                      style={{
                        width: 14,
                        height: 14,
                        color: "#CCC",
                        opacity: hoveredId === item.id ? 1 : 0,
                        transition: "opacity 100ms",
                      }}
                    />
                  </div>
                  {isExpanded && item.children && (
                    <div className="ml-3 border-l" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                      {item.children.map(child => (
                        <div
                          key={child.id}
                          className="flex items-center gap-1.5 px-2 py-1.5 ml-2 rounded-md cursor-pointer"
                          style={{
                            background: activeId === child.id ? "rgba(0,0,0,0.04)" : "transparent",
                            transition: "background 120ms",
                          }}
                          onClick={() => setActiveId(child.id)}
                          onMouseEnter={e => {
                            if (activeId !== child.id) e.currentTarget.style.background = "rgba(0,0,0,0.03)"
                            setHoveredId(child.id)
                          }}
                          onMouseLeave={e => {
                            if (activeId !== child.id) e.currentTarget.style.background = "transparent"
                            setHoveredId(null)
                          }}
                        >
                          <span style={{ width: 12 }} />
                          <File style={{ width: 13, height: 13, color: activeId === child.id ? "#E16B4F" : "#CCC" }} />
                          <span
                            className="text-sm flex-1 truncate"
                            style={{
                              color: activeId === child.id ? "#1A1A1A" : "#666",
                              fontWeight: activeId === child.id ? 500 : 400,
                            }}
                          >
                            {child.name}
                          </span>
                          <MoreHorizontal
                            style={{
                              width: 14,
                              height: 14,
                              color: "#CCC",
                              opacity: hoveredId === child.id ? 1 : 0,
                              transition: "opacity 100ms",
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer"
                style={{
                  background: activeId === item.id ? "rgba(0,0,0,0.04)" : "transparent",
                  transition: "background 120ms",
                }}
                onClick={() => setActiveId(item.id)}
                onMouseEnter={e => {
                  if (activeId !== item.id) e.currentTarget.style.background = "rgba(0,0,0,0.03)"
                  setHoveredId(item.id)
                }}
                onMouseLeave={e => {
                  if (activeId !== item.id) e.currentTarget.style.background = "transparent"
                  setHoveredId(null)
                }}
              >
                <span style={{ width: 12 }} />
                <File style={{ width: 13, height: 13, color: activeId === item.id ? "#E16B4F" : "#CCC" }} />
                <span
                  className="text-sm flex-1 truncate"
                  style={{
                    color: activeId === item.id ? "#1A1A1A" : "#666",
                    fontWeight: activeId === item.id ? 500 : 400,
                  }}
                >
                  {item.name}
                </span>
                {item.starred && (
                  <Star style={{ width: 11, height: 11, color: "#E2C87D", fill: "#E2C87D" }} />
                )}
                <MoreHorizontal
                  style={{
                    width: 14,
                    height: 14,
                    color: "#CCC",
                    opacity: hoveredId === item.id ? 1 : 0,
                    transition: "opacity 100ms",
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 pt-1" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
          <div
            className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer"
            style={{ transition: "background 120ms" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white"
              style={{ background: "#7C8594" }}>
              M
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate" style={{ color: "#444" }}>maciek@example.com</div>
            </div>
            <Settings style={{ width: 13, height: 13, color: "#CCC" }} />
          </div>
        </div>
      </aside>

      {/* Canvas area */}
      <main className="flex-1 relative overflow-hidden">
        {/* Subtle dot grid background */}
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle, #E0E0E0 0.5px, transparent 0.5px)",
          backgroundSize: "24px 24px",
        }} />

        {/* Breadcrumb bar */}
        <div className="relative z-10 flex items-center gap-1.5 px-5 py-3" style={{ color: "#999" }}>
          <Hash style={{ width: 12, height: 12 }} />
          <span className="text-xs" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {activeItem?.name ?? "Untitled"}
          </span>
          <span className="text-xs" style={{ color: "#DDD" }}>·</span>
          <span className="text-xs" style={{ color: "#CCC", fontFamily: "'IBM Plex Mono', monospace" }}>
            Edited 2m ago
          </span>
        </div>

        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center" style={{ color: "#CCC" }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl border-2 border-dashed flex items-center justify-center"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <File style={{ width: 24, height: 24, color: "#DDD" }} />
            </div>
            <p className="text-sm" style={{ color: "#AAA" }}>
              Treatment 1 — Notion-style minimal
            </p>
            <p className="text-xs mt-1" style={{ color: "#CCC" }}>
              Whisper-quiet, text-forward, hover-reveal
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
