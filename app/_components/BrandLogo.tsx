type Props = {
  className?: string
  width?: number
  priority?: boolean
}

export function BrandLogo({
  className = '',
  width = 200,
  priority = false,
}: Props) {
  return (
    <picture>
      <source srcSet="/logo.svg" type="image/svg+xml" />
      <img
        src="/logo.png"
        alt="Vyria Delivery"
        width={width}
        height={Math.max(64, Math.round(width * 0.42))}
        className={`h-auto w-auto max-w-full object-contain object-left ${className}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
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
