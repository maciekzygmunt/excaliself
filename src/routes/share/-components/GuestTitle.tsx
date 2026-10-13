type Props = { name: string }

export function GuestTitle({ name }: Props) {
  const label = name || "Untitled Drawing"
  return (
    <div className="pointer-events-auto hidden max-w-64 flex-nowrap items-baseline gap-2 lg:flex">
      <span
        className="max-w-45 truncate text-[0.95rem] font-semibold text-(--text-primary-color)"
        title={label}
      >
        {label}
      </span>
      <span className="shrink-0 text-xs text-(--color-gray-60)">Shared</span>
    </div>
  )
}
