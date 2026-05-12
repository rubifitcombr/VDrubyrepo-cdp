'use client'

import { VyriaPanelModeSwitcher } from '@/app/_components/VyriaPanelModeSwitcher'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { VyriaPanelMode } from '@/lib/vyria-panel-mode'
import { signOut } from '@/services/auth'
import { useEffect, useState } from 'react'

function IconMenu(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function IconClose(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMobileNavOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const nav = [{ href: '/admin/lojistas', label: 'Lojistas' }]

  const sidebarInner = (
    <>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 md:block md:py-5">
        <div>
          <p className="font-brand text-lg font-bold tracking-tight">Vyria Admin</p>
          <p className="mt-0.5 text-[11px] font-medium text-white/50">Gestão manual</p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-white/80 hover:bg-white/10 md:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileNavOpen(false)}
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 pt-3 md:pt-4">
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
              onClick={() => setMobileNavOpen(false)}
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
      <p className="px-4 pb-3 text-[10px] leading-relaxed text-white/35 md:pb-4">
        Em Lojistas podes definir o modelo de operação de cada loja (drawer lateral → Guardar modelo).
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
    </>
  )

  return (
    <div className="flex min-h-dvh bg-[var(--admin-surface)]">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        id="admin-mobile-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(17.5rem,88vw)] flex-col border-r border-[var(--card-border)] bg-[var(--admin-sidebar)] text-white shadow-xl transition-transform duration-200 ease-out md:static md:z-0 md:w-60 md:translate-x-0 md:shadow-md ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {sidebarInner}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:min-h-dvh">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--card-border)] bg-white/95 px-3 shadow-sm backdrop-blur-md sm:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[#fafafa] text-[#374151] md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="admin-mobile-sidebar"
            aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <span className="min-w-0 truncate text-sm font-semibold text-[#1a1614]">Vyria Admin</span>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
