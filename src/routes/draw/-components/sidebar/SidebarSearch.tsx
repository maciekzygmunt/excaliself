import { Search, X } from "lucide-react"
import { useRef } from "react"

type Props = {
  value: string
  onChange: (value: string) => void
}

export function SidebarSearch({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isSearching = value.length > 0

  return (
    <div className="px-3 pb-1">
      <div className="group/search relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search..."
          className="h-auto w-full bg-transparent text-sm text-sidebar-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => {
              onChange("")
              inputRef.current?.blur()
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
