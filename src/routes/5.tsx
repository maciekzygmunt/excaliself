import { createFileRoute } from "@tanstack/react-router"
import {
  ChevronDown,
  Clock,
  File,
  Folder,
  LogOut,
  MoreHorizontal,
  PenTool,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/5")({
  component: SidebarShowcase5,
})

/**
 * Treatment 5: "Bauhaus Studio" — Geometric, structured, editorial sidebar
 *
 * Aesthetic: Strongly geometric layout inspired by Bauhaus design.
 * Thick borders, bold section dividers, uppercase labels. Primary
 * colors as accents on a stark white/near-black split. Feels like
 * a design studio tool — structured, opinionated, art-directed.
 * The sidebar is split into distinct zones with hard borders.
 */

type MockItem = {
  id: string
  name: string
  type: "drawing" | "folder"
  status?: "active" | "draft" | "archived"
  children?: MockItem[]
  tag?: string
}

const STATUS_COLORS = {
  active: "#2563EB",
  draft: "#F59E0B",
  archived: "#9CA3AF",
}

const MOCK_ITEMS: MockItem[] = [
  {
    id: "1",
    name: "Homepage wireframe",
    type: "drawing",
    status: "active",
    tag: "web",
  },
  {
    id: "2",
    name: "User flow v3",
    type: "drawing",
    status: "active",
    tag: "ux",
  },
  {
    id: "3",
    name: "Component library",
    type: "drawing",
    status: "draft",
    tag: "system",
  },
  {
    id: "4",
    name: "Sprint 14",
    type: "folder",
    children: [
      {
        id: "5",
        name: "Login redesign",
        type: "drawing",
        status: "active",
        tag: "web",
      },
      {
        id: "6",
        name: "Dashboard layout",
        type: "drawing",
        status: "draft",
        tag: "web",
      },
      {
        id: "7",
        name: "Settings page",
        type: "drawing",
        status: "draft",
        tag: "web",
      },
    ],
  },
  {
    id: "8",
    name: "Archive",
    type: "folder",
    children: [
      {
        id: "9",
        name: "Old landing page",
        type: "drawing",
        status: "archived",
      },
    ],
  },
  {
    id: "10",
    name: "Brand exploration",
    type: "drawing",
    status: "active",
    tag: "brand",
  },
  {
    id: "11",
    name: "API diagram",
    type: "drawing",
    status: "draft",
    tag: "eng",
  },
  {
    id: "12",
    name: "Onboarding sketches",
    type: "drawing",
    status: "active",
    tag: "ux",
  },
]

function SidebarShowcase5() {
  const [activeId, setActiveId] = useState("1")
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["4"]),
  )
  const [activeSection, setActiveSection] = useState<
    "files" | "recent" | "starred"
  >("files")
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFlat = MOCK_ITEMS.flatMap((item) =>
    item.type === "folder" && item.children ? item.children : [item],
  ).filter((i) => i.type === "drawing")

  const activeItem = allFlat.find((i) => i.id === activeId) ?? allFlat[0]

  return (
    <div
      className="flex h-screen w-full"
      style={{
        fontFamily: "'Space Mono', 'SF Mono', monospace",
        background: "#FAFAFA",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Instrument+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Sidebar */}
      <aside
        className="flex flex-col h-full shrink-0 select-none"
        style={{
          width: 280,
          background: "#FAFAFA",
          borderRight: "3px solid #1A1A1A",
        }}
      >
        {/* Zone 1: Brand block */}
        <div style={{ borderBottom: "3px solid #1A1A1A" }}>
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 flex items-center justify-center"
                style={{
                  background: "#1A1A1A",
                }}
              >
                <PenTool style={{ width: 16, height: 16, color: "#FAFAFA" }} />
              </div>
              <div>
                <span
                  className="text-[13px] font-bold tracking-tight"
                  style={{
                    color: "#1A1A1A",
                    fontFamily: "'Instrument Sans', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Excalidraw
                </span>
              </div>
            </div>
            <button
              className="w-7 h-7 flex items-center justify-center transition-colors"
              style={{ border: "1.5px solid #1A1A1A" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1A1A1A"
                e.currentTarget.style.color = "#FAFAFA"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "#1A1A1A"
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Zone 2: Search */}
        <div style={{ borderBottom: "1.5px solid #1A1A1A" }}>
          <div className="flex items-center gap-2 px-4 py-3">
            <Search style={{ width: 14, height: 14, color: "#1A1A1A" }} />
            <input
              placeholder="SEARCH"
              className="bg-transparent border-none outline-none text-[11px] w-full tracking-widest"
              style={{
                color: "#1A1A1A",
                fontFamily: "'Space Mono', monospace",
                textTransform: "uppercase",
              }}
            />
            <kbd
              className="text-[9px] px-1.5 py-0.5 tracking-wider"
              style={{ border: "1px solid #CCC", color: "#999" }}
            >
              /
            </kbd>
          </div>
        </div>

        {/* Zone 3: Navigation tabs */}
        <div className="flex" style={{ borderBottom: "1.5px solid #1A1A1A" }}>
          {[
            { key: "files" as const, icon: Folder, label: "FILES" },
            { key: "recent" as const, icon: Clock, label: "RECENT" },
            { key: "starred" as const, icon: Star, label: "STARS" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
              style={{
                background: activeSection === key ? "#1A1A1A" : "transparent",
                color: activeSection === key ? "#FAFAFA" : "#999",
                borderRight: key !== "starred" ? "1.5px solid #1A1A1A" : "none",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              <span
                className="text-[8px] tracking-[0.15em] font-bold"
                style={{ fontFamily: "'Space Mono', monospace" }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Zone 4: File list */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Counter bar */}
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ borderBottom: "1px solid #E5E5E5" }}
          >
            <span
              className="text-[9px] tracking-[0.15em] font-bold"
              style={{ color: "#999" }}
            >
              {allFlat.length} ITEMS
            </span>
            <button style={{ color: "#999" }}>
              <SlidersHorizontal style={{ width: 12, height: 12 }} />
            </button>
          </div>

          {MOCK_ITEMS.map((item) => {
            if (item.type === "folder") {
              const isExpanded = expandedFolders.has(item.id)
              return (
                <div key={item.id}>
                  <div
                    className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors"
                    onClick={() => toggleFolder(item.id)}
                    style={{ borderBottom: "1px solid #EFEFEF" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#F0F0F0")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <ChevronDown
                      style={{
                        width: 12,
                        height: 12,
                        color: "#1A1A1A",
                        transform: isExpanded ? "rotate(0)" : "rotate(-90deg)",
                        transition: "transform 200ms",
                      }}
                    />
                    <Folder
                      style={{ width: 14, height: 14, color: "#1A1A1A" }}
                    />
                    <span
                      className="text-[12px] flex-1 truncate font-bold tracking-tight"
                      style={{
                        color: "#1A1A1A",
                        fontFamily: "'Instrument Sans', sans-serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {item.name}
                    </span>
                    <span
                      className="text-[9px] w-5 h-5 flex items-center justify-center font-bold"
                      style={{ background: "#1A1A1A", color: "#FAFAFA" }}
                    >
                      {item.children?.length}
                    </span>
                  </div>
                  {isExpanded &&
                    item.children?.map((child, idx) => (
                      <BauhausFileRow
                        key={child.id}
                        item={child}
                        isActive={activeId === child.id}
                        isHovered={hoveredId === child.id}
                        onClick={() => setActiveId(child.id)}
                        onHover={setHoveredId}
                        indent
                        isLast={idx === (item.children?.length ?? 0) - 1}
                      />
                    ))}
                </div>
              )
            }
            return (
              <BauhausFileRow
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

        {/* Zone 5: Status bar */}
        <div style={{ borderTop: "3px solid #1A1A1A" }}>
          {/* Status legend */}
          <div
            className="flex items-center gap-4 px-4 py-2"
            style={{ borderBottom: "1px solid #E5E5E5" }}
          >
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ background: color }} />
                <span
                  className="text-[8px] tracking-[0.1em] font-bold"
                  style={{
                    color: "#999",
                    fontFamily: "'Space Mono', monospace",
                    textTransform: "uppercase",
                  }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>

          {/* User */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className="w-7 h-7 flex items-center justify-center text-[10px] font-bold"
              style={{ background: "#1A1A1A", color: "#FAFAFA" }}
            >
              M
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[11px] truncate font-bold tracking-tight"
                style={{
                  color: "#1A1A1A",
                  fontFamily: "'Instrument Sans', sans-serif",
                }}
              >
                maciek@example.com
              </div>
              <div
                className="text-[8px] tracking-[0.15em]"
                style={{ color: "#999" }}
              >
                ADMIN
              </div>
            </div>
            <button
              className="p-1 transition-colors"
              style={{ color: "#999" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1A1A1A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#999")}
            >
              <LogOut style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Canvas */}
      <main
        className="flex-1 relative overflow-hidden"
        style={{ background: "#FAFAFA" }}
      >
        {/* Strong grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Top toolbar */}
        <div className="relative z-10 flex items-center gap-3 px-5 py-3">
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ border: "1.5px solid #1A1A1A" }}
          >
            <div
              className="w-2 h-2"
              style={{
                background: STATUS_COLORS[activeItem?.status ?? "draft"],
              }}
            />
            <span
              className="text-[10px] font-bold tracking-[0.1em]"
              style={{
                color: "#1A1A1A",
                fontFamily: "'Space Mono', monospace",
                textTransform: "uppercase",
              }}
            >
              {activeItem?.name}
            </span>
          </div>
          {activeItem?.tag && (
            <span
              className="text-[9px] px-2 py-1 font-bold tracking-[0.1em]"
              style={{
                background: "#1A1A1A",
                color: "#FAFAFA",
                fontFamily: "'Space Mono', monospace",
                textTransform: "uppercase",
              }}
            >
              {activeItem.tag}
            </span>
          )}
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            {/* Bauhaus-inspired geometric composition */}
            <div className="w-28 h-28 mx-auto mb-6 relative">
              <div
                className="absolute top-0 left-0 w-14 h-14"
                style={{ background: "#2563EB" }}
              />
              <div
                className="absolute top-0 right-0 w-14 h-14 rounded-full"
                style={{ background: "#F59E0B" }}
              />
              <div
                className="absolute bottom-0 left-0 w-14 h-14"
                style={{
                  background: "transparent",
                  borderLeft: "14px solid #EF4444",
                  borderBottom: "14px solid #EF4444",
                  borderRight: "14px solid transparent",
                  borderTop: "14px solid transparent",
                }}
              />
              <div
                className="absolute bottom-0 right-0 w-14 h-14"
                style={{ background: "#1A1A1A" }}
              />
            </div>
            <p
              className="text-[13px] font-bold tracking-[0.1em]"
              style={{
                color: "#1A1A1A",
                fontFamily: "'Space Mono', monospace",
                textTransform: "uppercase",
              }}
            >
              Treatment 5
            </p>
            <p
              className="text-[10px] mt-2 tracking-[0.15em]"
              style={{
                color: "#999",
                fontFamily: "'Space Mono', monospace",
                textTransform: "uppercase",
              }}
            >
              Bauhaus studio — Geometric, structured, editorial
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function BauhausFileRow({
  item,
  isActive,
  isHovered,
  onClick,
  onHover,
  indent,
  isLast,
}: {
  item: MockItem
  isActive: boolean
  isHovered: boolean
  onClick: () => void
  onHover: (id: string | null) => void
  indent?: boolean
  isLast?: boolean
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => {
        onHover(item.id)
        if (!isActive) e.currentTarget.style.background = "#F0F0F0"
      }}
      onMouseLeave={(e) => {
        onHover(null)
        if (!isActive) e.currentTarget.style.background = "transparent"
      }}
      className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors"
      style={{
        paddingLeft: indent ? 40 : 16,
        background: isActive ? "#1A1A1A" : "transparent",
        borderBottom: "1px solid #EFEFEF",
      }}
    >
      {/* Status indicator */}
      {item.status && (
        <div
          className="w-2 h-2 shrink-0"
          style={{
            background: STATUS_COLORS[item.status],
          }}
        />
      )}
      <File
        style={{
          width: 13,
          height: 13,
          color: isActive ? "#FAFAFA" : "#999",
        }}
      />
      <span
        className="text-[12px] flex-1 truncate"
        style={{
          color: isActive ? "#FAFAFA" : "#444",
          fontFamily: "'Instrument Sans', sans-serif",
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {item.name}
      </span>
      {item.tag && (
        <span
          className="text-[8px] px-1.5 py-0.5 tracking-[0.1em] font-bold"
          style={{
            background: isActive
              ? "rgba(255,255,255,0.15)"
              : "rgba(0,0,0,0.04)",
            color: isActive ? "rgba(255,255,255,0.7)" : "#BBB",
            fontFamily: "'Space Mono', monospace",
            textTransform: "uppercase",
          }}
        >
          {item.tag}
        </span>
      )}
      {isHovered && !isActive && (
        <MoreHorizontal style={{ width: 13, height: 13, color: "#CCC" }} />
      )}
    </div>
  )
}
