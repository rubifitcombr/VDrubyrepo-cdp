import Link from 'next/link'

export function MasterModuleHeader({
  title,
  description,
  moduleLabel,
}: {
  title: string
  description: string
  moduleLabel: string
}) {
  return (
    <>
      <nav className="text-xs text-vyria-navy-muted">
        <Link href="/dashboard/visao" className="hover:text-vyria-navy">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-vyria-navy">{moduleLabel}</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          Plano Master
        </p>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">{description}</p>
      </header>
    </>
  )
}
