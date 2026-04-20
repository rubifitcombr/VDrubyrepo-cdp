'use client'

import { VyriaPanelModeSwitcher } from '@/app/_components/VyriaPanelModeSwitcher'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { VyriaPanelMode } from '@/lib/vyria-panel-mode'
import { signOut } from '@/services/auth'

export function AdminShell({
  children,
  adminEmail,
  vyriaPanelMode = 'admin',
}: {
  children: React.ReactNode
  adminEmail: string | null
  vyriaPanelMode?: VyriaPanelMode
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const nav = [{ href: '/admin/lojistas', label: 'Lojistas' }]

  return (
    <div className="flex min-h-dvh bg-[var(--admin-surface)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--card-border)] bg-[var(--admin-sidebar)] text-white shadow-md">
        <div className="border-b border-white/10 px-4 py-5">
          <p className="font-brand text-lg font-bold tracking-tight">Vyria Admin</p>
          <p className="mt-0.5 text-[11px] font-medium text-white/50">Gestão manual</p>
        </div>

        <div className="px-3 pt-4">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
            Navegação
          </p>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-2" aria-label="Admin">
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
        <p className="px-4 pb-4 text-[10px] leading-relaxed text-white/35">
          Planos, relatórios e outras secções em breve.
        </p>

        <div className="mt-auto space-y-3 border-t border-white/10 p-3">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
            Conta
          </p>
          <p className="px-1 text-xs leading-snug text-white/75">
            <span className="text-white/50">Logado como:</span>{' '}
            <span className="break-all font-medium text-white/95">{adminEmail ?? '—'}</span>
          </p>
          <VyriaPanelModeSwitcher variant="admin" currentMode={vyriaPanelMode} />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10"
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-[var(--card-border)] bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-6">
          <span className="text-sm font-semibold text-[#1a1614]">Vyria Admin</span>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
