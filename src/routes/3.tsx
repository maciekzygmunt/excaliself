import { createFileRoute } from "@tanstack/react-router"
import {
  ChevronRight,
  File,
  Folder,
  Grip,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/3")({
  component: SidebarShowcase3,
})

/**
 * Treatment 3: "Glass Panel" — Floating glassmorphism sidebar
 *
 * Aesthetic: A translucent floating panel that hovers over the canvas.
 * Deep dark canvas with a frosted-glass sidebar. Warm amber/gold accent
 * on deep navy. Feels like a premium creative tool — Figma meets a
 * luxury car dashboard. Rounded, soft, layered.
 */

type MockItem = {
  id: string
  name: string
  type: "drawing" | "folder"
  starred?: boolean
  children?: MockItem[]
  emoji?: string
}

const MOCK_ITEMS: MockItem[] = [
  { id: "1", name: "Homepage wireframe", type: "drawing", starred: true, emoji: "🏠" },
  { id: "2", name: "User flow v3", type: "drawing", starred: true, emoji: "🔀" },
  { id: "3", name: "Component library", type: "drawing", emoji: "📦" },
  { id: "4", name: "Sprint 14", type: "folder", emoji: "🚀", children: [
    { id: "5", name: "Login redesign", type: "drawing", emoji: "🔐" },
    { id: "6", name: "Dashboard layout", type: "drawing", emoji: "📊" },
    { id: "7", name: "Settings page", type: "drawing", emoji: "⚙️" },
  ]},
  { id: "8", name: "Archive", type: "folder", emoji: "📁", children: [
    { id: "9", name: "Old landing page", type: "drawing", emoji: "📄" },
  ]},
  { id: "10", name: "Brand exploration", type: "drawing", emoji: "🎨" },
  { id: "11", name: "API diagram", type: "drawing", emoji: "🔌" },
  { id: "12", name: "Onboarding sketches", type: "drawing", emoji: "✏️" },
]

function SidebarShowcase3() {
  const [activeId, setActiveId] = useState("1")
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["4"]))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden" style={{
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      background: "#0C0E16",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />

      {/* Ambient background effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute -top-[300px] -left-[200px] w-[700px] h-[700px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(210,160,80,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="absolute -bottom-[200px] -right-[300px] w-[600px] h-[600px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(100,130,220,0.05) 0%, transparent 70%)",
          }}
        />
        {/* Subtle noise texture */}
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }} />
      </div>

      {/* Floating sidebar */}
      <div
        className="absolute left-4 top-4 bottom-4 z-30 flex flex-col rounded-2xl select-none overflow-hidden"
        style={{
          width: sidebarOpen ? 280 : 52,
          transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          background: "rgba(18, 20, 30, 0.75)",
          backdropFilter: "blur(40px) saturate(1.5)",
          WebkitBackdropFilter: "blur(40px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >
        {sidebarOpen ? (
          <>
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #D4A853, #B8893A)",
                    boxShadow: "0 2px 8px rgba(212,168,83,0.25)",
                  }}>
                  <Zap style={{ width: 14, height: 14, color: "#1A1520" }} />
                </div>
                <span className="text-[14px] font-semibold tracking-tight" style={{ color: "#E8E4DD" }}>
                  Excalidraw
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "#666" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Search style={{ width: 14, height: 14 }} />
                </button>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "#666" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            {/* Search (collapsible) */}
            <div style={{
              maxHeight: searchOpen ? 50 : 0,
              opacity: searchOpen ? 1 : 0,
              overflow: "hidden",
              transition: "max-height 250ms ease, opacity 200ms ease",
            }}>
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                  <Search style={{ width: 12, height: 12, color: "#555" }} />
                  <input
                    placeholder="Find a drawing..."
                    className="bg-transparent border-none outline-none text-[12px] w-full"
                    style={{ color: "#CCC", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>

            {/* New drawing button */}
            <div className="px-4 pb-2">
              <button
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(212,168,83,0.12), rgba(212,168,83,0.06))",
                  color: "#D4A853",
                  border: "1px solid rgba(212,168,83,0.15)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(212,168,83,0.2), rgba(212,168,83,0.1))"
                  e.currentTarget.style.borderColor = "rgba(212,168,83,0.3)"
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(212,168,83,0.15)"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(212,168,83,0.12), rgba(212,168,83,0.06))"
                  e.currentTarget.style.borderColor = "rgba(212,168,83,0.15)"
                  e.currentTarget.style.boxShadow = "none"
                }}
              >
                <Plus style={{ width: 14, height: 14 }} />
                New drawing
              </button>
            </div>

            {/* Divider */}
            <div className="mx-4" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

            {/* Starred */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-1.5">
                <Star style={{ width: 10, height: 10, color: "#D4A853", fill: "#D4A853" }} />
                <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "#666" }}>
                  Favorites
                </span>
              </div>
            </div>
            <div className="px-2">
              {MOCK_ITEMS.filter(i => i.starred).map(item => (
                <GlassFileRow
                  key={item.id}
                  item={item}
                  isActive={activeId === item.id}
                  isHovered={hoveredId === item.id}
                  onClick={() => setActiveId(item.id)}
                  onHover={setHoveredId}
                />
              ))}
            </div>

            <div className="mx-4 my-1" style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

            {/* File tree */}
            <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "none" }}>
              <div className="px-2 py-2">
                <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "#555" }}>
                  All drawings
                </span>
              </div>
              {MOCK_ITEMS.map(item => {
                if (item.type === "folder") {
                  const isExpanded = expandedFolders.has(item.id)
                  return (
                    <div key={item.id}>
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors"
                        onClick={() => toggleFolder(item.id)}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <ChevronRight style={{
                          width: 11,
                          height: 11,
                          color: "#555",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 200ms ease",
                        }} />
                        <span className="text-[14px]">{item.emoji}</span>
                        <span className="text-[13px] flex-1 truncate" style={{ color: "#999" }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{
                        maxHeight: isExpanded ? 500 : 0,
                        opacity: isExpanded ? 1 : 0,
                        overflow: "hidden",
                        transition: "max-height 300ms ease, opacity 200ms ease",
                      }}>
                        <div className="ml-4 border-l" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          {item.children?.map(child => (
                            <GlassFileRow
                              key={child.id}
                              item={child}
                              isActive={activeId === child.id}
                              isHovered={hoveredId === child.id}
                              onClick={() => setActiveId(child.id)}
                              onHover={setHoveredId}
                              indent
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <GlassFileRow
                    key={item.id}
                    item={item}
                    isActive={activeId === item.id}
                    isHovered={hoveredId === item.id}
                    onClick={() => setActiveId(item.id)}
                    onHover={setHoveredId}
                  />
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-3 pb-3 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                  style={{
                    background: "linear-gradient(135deg, #3A3545, #2A2535)",
                    color: "#D4A853",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                  M
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" style={{ color: "#AAA" }}>maciek@example.com</div>
                </div>
                <LogOut style={{ width: 12, height: 12, color: "#555" }} />
              </div>
            </div>
          </>
        ) : (
          /* Collapsed state — icon strip */
          <div className="flex flex-col items-center py-3 gap-1 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 rounded-xl transition-colors"
              style={{ color: "#888" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Grip style={{ width: 16, height: 16 }} />
            </button>
            <div className="my-1" style={{ width: 20, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <button className="p-2.5 rounded-xl transition-colors" style={{ color: "#D4A853" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Plus style={{ width: 16, height: 16 }} />
            </button>
            <button className="p-2.5 rounded-xl transition-colors" style={{ color: "#666" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Search style={{ width: 16, height: 16 }} />
            </button>
            <div className="flex-1" />
            <button className="p-2.5 rounded-xl transition-colors" style={{ color: "#555" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Settings style={{ width: 16, height: 16 }} />
            </button>
          </div>
        )}
      </div>

      {/* Canvas */}
      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.015) 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }} />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-5 rounded-3xl flex items-center justify-center"
              style={{
                background: "rgba(212,168,83,0.06)",
                border: "1px solid rgba(212,168,83,0.1)",
                boxShadow: "0 0 40px rgba(212,168,83,0.05)",
              }}>
              <Sparkles style={{ width: 32, height: 32, color: "rgba(212,168,83,0.35)" }} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: "#666" }}>
              Treatment 3 — Glass Panel
            </p>
            <p className="text-[12px] mt-1" style={{ color: "#444" }}>
              Floating glassmorphism, gold accent, premium feel
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function GlassFileRow({
  item,
  isActive,
  isHovered,
  onClick,
  onHover,
  indent,
}: {
  item: MockItem
  isActive: boolean
  isHovered: boolean
  onClick: () => void
  onHover: (id: string | null) => void
  indent?: boolean
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={e => {
        onHover(item.id)
        if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"
      }}
      onMouseLeave={e => {
        onHover(null)
        if (!isActive) e.currentTarget.style.background = "transparent"
      }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all"
      style={{
        marginLeft: indent ? 8 : 0,
        background: isActive
          ? "linear-gradient(135deg, rgba(212,168,83,0.1), rgba(212,168,83,0.04))"
          : "transparent",
        border: isActive ? "1px solid rgba(212,168,83,0.12)" : "1px solid transparent",
      }}
    >
      <span className="text-[14px] shrink-0">{item.emoji}</span>
      <span
        className="text-[13px] flex-1 truncate"
        style={{
          color: isActive ? "#E8E4DD" : "#888",
          fontWeight: isActive ? 500 : 400,
        }}
      >
        {item.name}
      </span>
      {isActive && (
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#D4A853" }} />
      )}
    </div>
  )
}
