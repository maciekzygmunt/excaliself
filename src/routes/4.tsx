import { createFileRoute } from "@tanstack/react-router"
import {
  Clock,
  File,
  Folder,
  Grid3X3,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Star,
  TrendingUp,
  User,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/4")({
  component: SidebarShowcase4,
})

/**
 * Treatment 4: "Bento Grid" — Card-based sidebar with visual previews
 *
 * Aesthetic: Inspired by Apple's bento grid marketing. Each drawing gets
 * a visual card with a color-coded preview swatch. The sidebar is wider
 * than usual — more of a panel. Uses a warm, creamy off-white with
 * soft shadows and rounded everything. Feels tactile and modern.
 * Think iOS meets Pinterest.
 */

type MockItem = {
  id: string
  name: string
  type: "drawing" | "folder"
  color: string
  starred?: boolean
  modified: string
  children?: MockItem[]
}

const MOCK_ITEMS: MockItem[] = [
  { id: "1", name: "Homepage wireframe", type: "drawing", color: "#FF6B6B", starred: true, modified: "2m" },
  { id: "2", name: "User flow v3", type: "drawing", color: "#4ECDC4", starred: true, modified: "1h" },
  { id: "3", name: "Component library", type: "drawing", color: "#45B7D1", modified: "3h" },
  { id: "4", name: "Sprint 14", type: "folder", color: "#96CEB4", modified: "1d", children: [
    { id: "5", name: "Login redesign", type: "drawing", color: "#FFEAA7", modified: "1d" },
    { id: "6", name: "Dashboard layout", type: "drawing", color: "#DDA0DD", modified: "1d" },
    { id: "7", name: "Settings page", type: "drawing", color: "#98D8C8", modified: "2d" },
  ]},
  { id: "8", name: "Brand exploration", type: "drawing", color: "#F7DC6F", modified: "3d" },
  { id: "9", name: "API diagram", type: "drawing", color: "#BB8FCE", modified: "1w" },
  { id: "10", name: "Onboarding sketches", type: "drawing", color: "#F0B27A", modified: "1w" },
  { id: "11", name: "Icon set draft", type: "drawing", color: "#85C1E9", modified: "2w" },
  { id: "12", name: "Mobile app flow", type: "drawing", color: "#E8A87C", modified: "2w" },
]

function SidebarShowcase4() {
  const [activeId, setActiveId] = useState("1")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [section, setSection] = useState<"all" | "recent" | "starred">("all")

  const allFlat = MOCK_ITEMS.flatMap(item =>
    item.type === "folder" && item.children ? [item, ...item.children] : [item]
  ).filter(i => i.type === "drawing")

  const displayItems = section === "starred"
    ? allFlat.filter(i => i.starred)
    : section === "recent"
      ? allFlat.slice(0, 4)
      : allFlat

  const activeItem = allFlat.find(i => i.id === activeId) ?? allFlat[0]

  return (
    <div className="flex h-screen w-full" style={{
      fontFamily: "'Nunito', 'SF Pro Rounded', -apple-system, sans-serif",
      background: "#F5F3EE",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Wide sidebar panel */}
      <aside className="flex flex-col h-full shrink-0 select-none" style={{
        width: 340,
        background: "#FAF9F6",
        borderRight: "1px solid rgba(0,0,0,0.05)",
      }}>
        {/* Header with app name */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #FF6B6B, #FF8E8E)",
                  boxShadow: "0 4px 12px rgba(255,107,107,0.3)",
                }}>
                <Grid3X3 style={{ width: 18, height: 18, color: "white" }} />
              </div>
              <div>
                <span className="text-[16px] font-bold tracking-tight" style={{ color: "#2D2D2D" }}>
                  Excalidraw
                </span>
                <div className="text-[11px] font-medium" style={{ color: "#BBB" }}>
                  12 drawings
                </div>
              </div>
            </div>
            <button className="p-2 rounded-xl transition-all"
              style={{ color: "#CCC" }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(0,0,0,0.04)"
                e.currentTarget.style.color = "#999"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "#CCC"
              }}
            >
              <Settings style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2.5 rounded-2xl px-4 py-3 transition-all"
            style={{
              background: "rgba(0,0,0,0.03)",
              border: "1.5px solid transparent",
            }}
            onFocus={e => {
              const target = e.currentTarget
              target.style.background = "white"
              target.style.borderColor = "rgba(255,107,107,0.3)"
              target.style.boxShadow = "0 4px 16px rgba(255,107,107,0.08)"
            }}
            onBlur={e => {
              const target = e.currentTarget
              target.style.background = "rgba(0,0,0,0.03)"
              target.style.borderColor = "transparent"
              target.style.boxShadow = "none"
            }}
          >
            <Search style={{ width: 15, height: 15, color: "#CCC", flexShrink: 0 }} />
            <input
              placeholder="Search drawings..."
              className="bg-transparent border-none outline-none text-[13px] w-full font-medium"
              style={{ color: "#555", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {/* Section tabs */}
        <div className="px-5 pb-3 flex items-center gap-1.5">
          {([
            { key: "all" as const, label: "All", icon: LayoutGrid },
            { key: "recent" as const, label: "Recent", icon: Clock },
            { key: "starred" as const, label: "Starred", icon: Star },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all"
              style={{
                background: section === key ? "white" : "transparent",
                color: section === key ? "#2D2D2D" : "#BBB",
                boxShadow: section === key ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <Icon style={{ width: 12, height: 12 }} />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.03)" }}>
            <button
              onClick={() => setViewMode("grid")}
              className="p-1.5 transition-colors"
              style={{
                color: viewMode === "grid" ? "#FF6B6B" : "#CCC",
                background: viewMode === "grid" ? "white" : "transparent",
              }}
            >
              <LayoutGrid style={{ width: 13, height: 13 }} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="p-1.5 transition-colors"
              style={{
                color: viewMode === "list" ? "#FF6B6B" : "#CCC",
                background: viewMode === "list" ? "white" : "transparent",
              }}
            >
              <List style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "none" }}>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-2.5">
              {displayItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all"
                  style={{
                    background: "white",
                    border: activeId === item.id ? "2px solid" : "2px solid transparent",
                    borderColor: activeId === item.id ? item.color : "transparent",
                    boxShadow: activeId === item.id
                      ? `0 4px 20px ${item.color}25`
                      : "0 1px 4px rgba(0,0,0,0.04)",
                    transform: activeId === item.id ? "scale(1)" : "scale(1)",
                    transition: "all 200ms ease",
                  }}
                  onMouseEnter={e => {
                    if (activeId !== item.id) {
                      e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"
                      e.currentTarget.style.transform = "translateY(-2px)"
                    }
                  }}
                  onMouseLeave={e => {
                    if (activeId !== item.id) {
                      e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"
                      e.currentTarget.style.transform = "translateY(0)"
                    }
                  }}
                >
                  {/* Color preview area */}
                  <div className="h-[72px] relative"
                    style={{
                      background: `linear-gradient(135deg, ${item.color}20, ${item.color}08)`,
                    }}>
                    {/* Abstract preview shapes */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
                      <rect x="15" y="10" width="30" height="18" rx="3" fill={`${item.color}25`} />
                      <rect x="55" y="15" width="25" height="25" rx="12" fill={`${item.color}15`} />
                      <line x1="20" y1="38" x2="70" y2="38" stroke={`${item.color}18`} strokeWidth="1.5" />
                      <circle cx="80" cy="12" r="6" fill={`${item.color}20`} />
                    </svg>
                    {/* Star badge */}
                    {item.starred && (
                      <div className="absolute top-2 right-2 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.9)" }}>
                        <Star style={{ width: 10, height: 10, color: "#F7DC6F", fill: "#F7DC6F" }} />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-3 py-2.5">
                    <div className="text-[12px] font-semibold truncate" style={{ color: "#2D2D2D" }}>
                      {item.name}
                    </div>
                    <div className="text-[10px] mt-0.5 font-medium" style={{ color: "#CCC" }}>
                      {item.modified} ago
                    </div>
                  </div>
                </div>
              ))}

              {/* Add new card */}
              <div
                className="rounded-2xl overflow-hidden cursor-pointer flex flex-col items-center justify-center py-6 transition-all"
                style={{
                  border: "2px dashed rgba(0,0,0,0.08)",
                  minHeight: 120,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "rgba(255,107,107,0.3)"
                  e.currentTarget.style.background = "rgba(255,107,107,0.03)"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2"
                  style={{ background: "rgba(0,0,0,0.03)" }}>
                  <Plus style={{ width: 18, height: 18, color: "#CCC" }} />
                </div>
                <span className="text-[11px] font-semibold" style={{ color: "#CCC" }}>New drawing</span>
              </div>
            </div>
          ) : (
            /* List view */
            <div className="space-y-1">
              {displayItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all"
                  style={{
                    background: activeId === item.id ? "white" : "transparent",
                    boxShadow: activeId === item.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  }}
                  onMouseEnter={e => {
                    if (activeId !== item.id) e.currentTarget.style.background = "rgba(255,255,255,0.6)"
                  }}
                  onMouseLeave={e => {
                    if (activeId !== item.id) e.currentTarget.style.background = "transparent"
                  }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}18` }}>
                    <File style={{ width: 14, height: 14, color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: activeId === item.id ? "#2D2D2D" : "#666" }}>
                      {item.name}
                    </div>
                    <div className="text-[10px] font-medium" style={{ color: "#CCC" }}>
                      Edited {item.modified} ago
                    </div>
                  </div>
                  {item.starred && (
                    <Star style={{ width: 11, height: 11, color: "#F7DC6F", fill: "#F7DC6F" }} />
                  )}
                  <MoreVertical style={{ width: 13, height: 13, color: "#DDD" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all"
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold"
              style={{
                background: "linear-gradient(135deg, #FF6B6B, #FF8E8E)",
                color: "white",
              }}>
              M
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold truncate" style={{ color: "#444" }}>
                maciek@example.com
              </div>
              <div className="text-[10px] font-medium" style={{ color: "#CCC" }}>Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Canvas */}
      <main className="flex-1 relative overflow-hidden" style={{ background: "#F5F3EE" }}>
        {/* Soft dot grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        {/* Top info bar */}
        <div className="relative z-10 flex items-center gap-3 px-6 py-4">
          <div className="w-3 h-3 rounded-full" style={{ background: activeItem?.color }} />
          <span className="text-[13px] font-semibold" style={{ color: "#444" }}>
            {activeItem?.name}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-lg" style={{ background: "white", color: "#BBB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {activeItem?.modified} ago
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center"
              style={{
                background: "white",
                boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
              }}>
              <LayoutGrid style={{ width: 28, height: 28, color: "#FF6B6B" }} />
            </div>
            <p className="text-[14px] font-bold" style={{ color: "#666" }}>
              Treatment 4 — Bento Grid
            </p>
            <p className="text-[12px] mt-1 font-medium" style={{ color: "#BBB" }}>
              Card-based, visual previews, Apple-inspired
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
