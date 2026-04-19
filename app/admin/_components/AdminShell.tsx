'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/services/auth'

export function AdminShell({
  children,
  adminEmail,
}: {
  children: React.ReactNode
  adminEmail: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const nav = [
    { href: '/admin/lojistas', label: 'Lojistas' },
  ]

  return (
    <div className="flex min-h-dvh bg-[var(--admin-surface)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--card-border)] bg-[var(--admin-sidebar)] text-white shadow-md">
        <div className="border-b border-white/10 px-4 py-5">
          <p className="font-brand text-lg font-bold tracking-tight">Vyria Admin</p>
          <p className="mt-0.5 text-[11px] font-medium text-white/50">Gestão manual</p>
        </div>
        <nav className="flex flex-col gap-0.5 p-2" aria-label="Admin">
          {nav.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-[var(--card-border)] bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-6">
          <span className="text-sm font-semibold text-[#1a1614]">Vyria Admin</span>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[14rem] truncate text-xs text-[#6b7280] sm:inline">
              {adminEmail ?? '—'}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
            >
              Sair
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
