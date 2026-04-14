type Props = {
  slug: string
  className?: string
}

/** Barra de URL em pílula (estilo preview mobile). Mostra só o path público `/{slug}`. */
export function PublicSlugPathPill({ slug, className = '' }: Props) {
  const clean = slug.replace(/^\/+/, '').trim()
  const path = clean ? `/${clean}` : '/'

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center justify-center rounded-full bg-[#141414] px-3.5 py-1.5 text-center text-[12px] font-medium leading-none tracking-tight text-white shadow-[0_2px_14px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.1] sm:px-4 sm:py-2 sm:text-[13px] ${className}`}
    >
      <span className="truncate font-sans">{path}</span>
    </span>
  )
}
