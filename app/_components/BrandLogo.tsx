type Props = {
  className?: string
  width?: number
  priority?: boolean
}

export function BrandLogo({
  className = '',
  width = 200,
}: Props) {
  return (
    <span
      className={`inline-flex h-auto max-w-full items-center text-left font-semibold tracking-tight text-[#171717] ${className}`}
      style={{ fontSize: Math.max(20, Math.round(width * 0.16)) }}
    >
      Vyria Delivery
    </span>
  )
}

export function BrandLogoChip({
  className = '',
  width = 132,
}: Omit<Props, 'priority'>) {
  return (
    <div
      className={`inline-flex max-w-full rounded-xl bg-[#f9f9f9] px-2 py-1.5 shadow-inner ring-1 ring-black/5 ${className}`}
    >
      <BrandLogo width={width} priority className="max-h-9 md:max-h-10" />
    </div>
  )
}
