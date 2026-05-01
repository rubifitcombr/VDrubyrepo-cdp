'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandLogo } from '@/app/_components/BrandLogo'
import { VyriaPanelModeSwitcher } from '@/app/_components/VyriaPanelModeSwitcher'
import type { VyriaPanelMode } from '@/lib/vyria-panel-mode'
import type { Plan } from '@/lib/plan'
import type { DashboardMenuKey } from '@/lib/dashboard-menu'
import { menuKeysForPlan } from '@/lib/dashboard-menu'
import { DashboardLogoutButton } from './DashboardLogoutButton'
import { DashboardPlanGuard } from './DashboardPlanGuard'
import { DashboardTopBar } from './DashboardTopBar'
import { InstallAppBanner } from './InstallAppBanner'
import { DashboardNotificationPrompt } from './DashboardNotificationPrompt'
import { DashboardOrderRealtimeNotifier } from './DashboardOrderRealtimeNotifier'
import {
  IconBag,
  IconBolt,
  IconCart,
  IconChartBars,
  IconClipboard,
  IconCog,
  IconCurrency,
  IconExternal,
  IconHome,
  IconKds,
  IconMenuBook,
  IconPalette,
  IconPrinter,
  IconTag,
  IconTrendUp,
} from './NavIcons'

const nav: Array<{
  href: string
  label: string
  icon: (p: { className?: string }) => React.ReactNode
  menuKey: DashboardMenuKey
  /** Item secundário (menos destaque visual no sidebar). */
  quiet?: boolean
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: IconHome, menuKey: 'dashboard' },
  {
    href: '/dashboard/menu',
    label: 'Produtos',
    icon: IconMenuBook,
    menuKey: 'produtos',
  },
  {
    href: '/dashboard/orders',
    label: 'Pedidos',
    icon: IconCart,
    menuKey: 'pedidos',
  },
  {
    href: '/dashboard/garcom',
    label: 'Garçom',
    icon: IconClipboard,
    menuKey: 'garcom',
  },
  {
    href: '/dashboard/pdv',
    label: 'PDV',
    icon: IconBag,
    menuKey: 'pdv',
  },
  {
    href: '/dashboard/kds',
    label: 'KDS',
    icon: IconKds,
    menuKey: 'kds',
  },
  {
    href: '/dashboard/caixa',
    label: 'Caixa',
    icon: IconCurrency,
    menuKey: 'caixa',
  },
  {
    href: '/dashboard/promotions',
    label: 'Promoções',
    icon: IconTag,
    menuKey: 'promocoes',
  },
  {
    href: '/dashboard/reports',
    label: 'Relatórios',
    icon: IconChartBars,
    menuKey: 'relatorios',
  },
  {
    href: '/dashboard/settings',
    label: 'Configurações',
    icon: IconCog,
    menuKey: 'configuracoes',
  },
  {
    href: '/dashboard/appearance',
    label: 'Aparência',
    icon: IconPalette,
    menuKey: 'aparencia',
  },
  {
    href: '/dashboard/automations',
    label: 'Automações',
    icon: IconBolt,
    menuKey: 'automacoes',
  },
  {
    href: '/dashboard/printing',
    label: 'Impressão',
    icon: IconPrinter,
    menuKey: 'impressao',
  },
  {
    href: '/dashboard/assinatura',
    label: 'Assinatura',
    icon: IconClipboard,
    menuKey: 'assinatura',
    quiet: true,
  },
]

function PlansNavCta({
  pathname,
  layout,
}: {
  pathname: string
  layout: 'sidebar' | 'bottom' | 'drawer'
}) {
  const active = pathname === '/planos' || pathname.startsWith('/dashboard/planos')
  const linkSidebar =
    `flex shrink-0 items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors md:w-full md:rounded-full ${
      active
        ? 'rounded-full bg-orange-400/20 text-orange-100 shadow-sm ring-1 ring-orange-400/35 active:bg-orange-500/30'
        : 'rounded-full text-orange-200/95 hover:bg-orange-500/15 hover:text-orange-50 active:bg-orange-600/25'
    }`
  const linkBottom =
    `flex shrink-0 items-center gap-2 rounded-full px-2.5 py-2 text-xs font-semibold transition-colors ${
      active
        ? 'bg-orange-400/25 text-orange-100 ring-1 ring-orange-400/35 active:bg-orange-500/35'
        : 'text-orange-200/95 hover:bg-orange-500/15 active:bg-orange-600/25'
    }`

  const linkDrawer =
    `flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-orange-400/20 text-orange-100 shadow-sm ring-1 ring-orange-400/35 active:bg-orange-500/30'
        : 'text-orange-200/95 hover:bg-orange-500/15 hover:text-orange-50 active:bg-orange-600/25'
    }`

  return (
    <Link
      href="/planos"
      className={
        layout === 'sidebar' ? linkSidebar : layout === 'drawer' ? linkDrawer : linkBottom
      }
    >
      <IconTrendUp
        className={`shrink-0 ${
          layout === 'bottom' ? 'h-4 w-4 opacity-95' : 'h-5 w-5 opacity-95'
        }`}
      />
      <span className="whitespace-nowrap">Conheça nossos planos</span>
    </Link>
  )
}

function DashboardNavLinks({
  pathname,
  plan,
  layout,
}: {
  pathname: string
  plan: Plan
  layout: 'sidebar' | 'bottom' | 'drawer'
}) {
  const allowed = menuKeysForPlan(plan)
  const items = nav.filter((item) => allowed.has(item.menuKey))

  const navClass =
    layout === 'sidebar'
      ? 'flex flex-col gap-0.5 p-3 pt-2'
      : layout === 'drawer'
        ? 'flex flex-col gap-1 p-3 pt-2'
        : 'flex touch-pan-x gap-1 overflow-x-auto overscroll-x-contain p-2'

  return (
    <nav className={navClass} aria-label="Navegação do painel">
      {items.map(({ href, label, icon: Icon, quiet, menuKey }) => {
        const active =
          href === '/dashboard'
            ? pathname === '/dashboard'
            : menuKey === 'produtos'
              ? pathname.startsWith('/dashboard/menu') ||
                pathname.startsWith('/dashboard/inventory')
              : pathname.startsWith(href)
        const quietInactive = !!quiet && !active

        const linkSidebar =
          `flex shrink-0 items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors md:w-full md:rounded-full ${
            active
              ? 'rounded-full bg-[var(--dash-primary)] text-white shadow-md shadow-[var(--dash-primary)]/25 active:brightness-[0.88]'
              : quietInactive
                ? 'rounded-full text-white/40 hover:bg-white/[0.05] hover:text-white/55 active:bg-black/35'
                : 'rounded-full text-white/65 hover:bg-white/10 hover:text-white active:bg-white/[0.16]'
          }`

        const linkBottom =
          `flex shrink-0 items-center gap-2 rounded-full px-2.5 py-2 text-xs font-medium transition-colors ${
            active
              ? 'bg-[var(--dash-primary)] text-white shadow-md shadow-[var(--dash-primary)]/25 active:brightness-[0.88]'
              : quietInactive
                ? 'text-white/40 hover:bg-white/[0.05] hover:text-white/55 active:bg-black/35'
                : 'text-white/70 hover:bg-white/10 hover:text-white active:bg-white/[0.16]'
          }`

        const linkDrawer =
          `flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${
            active
              ? 'bg-[var(--dash-primary)] text-white shadow-md shadow-[var(--dash-primary)]/25 active:brightness-[0.88]'
              : quietInactive
                ? 'text-white/40 hover:bg-white/[0.05] hover:text-white/55 active:bg-black/35'
                : 'text-white/70 hover:bg-white/10 hover:text-white active:bg-white/[0.16]'
          }`

        return (
          <Link
            key={href}
            href={href}
            className={
              layout === 'sidebar' ? linkSidebar : layout === 'drawer' ? linkDrawer : linkBottom
            }
          >
            <Icon
              className={`shrink-0 ${
                quietInactive
                  ? 'h-4 w-4 opacity-55'
                  : layout === 'bottom'
                    ? 'h-4 w-4 opacity-95'
                    : 'h-5 w-5 opacity-95'
              }`}
            />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function DashboardShell({
  children,
  storeName,
  storeSlug,
  storeLogoUrl,
  storeId,
  isAuthenticated,
  plan,
  notificationCount = 0,
  billingBanner = null,
  billingBlock = null,
  vyriaDualAccount,
}: {
  children: React.ReactNode
  storeName: string | null
  storeSlug: string | null
  storeLogoUrl: string | null
  storeId: string | null
  isAuthenticated: boolean
  plan: Plan
  notificationCount?: number
  billingBanner?: {
    openInvoiceDateLabel: string
    payUrl: string
  } | null
  billingBlock?: { payUrl: string | null } | null
  vyriaDualAccount?: { mode: VyriaPanelMode }
}) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const mainInner =
    billingBlock && isAuthenticated ? (
      <div className="flex min-h-[min(28rem,70vh)] flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--card-border)] bg-white p-8 text-center shadow-sm shadow-black/[0.04]">
        <p className="text-lg font-bold text-[#1a1614]">Acesso suspenso</p>
        <p className="max-w-md text-sm text-[#6b7280]">
          A conta está bloqueada por inadimplência prolongada. Regulariza o pagamento para voltar a
          usar o painel.
        </p>
        {billingBlock.payUrl ? (
          <a
            href={billingBlock.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--dash-primary)] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter] hover:brightness-105"
          >
            Pagar agora
          </a>
        ) : null}
      </div>
    ) : (
      <DashboardPlanGuard plan={plan}>{children}</DashboardPlanGuard>
    )

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--dash-surface)] md:flex-row">
      <aside className="sticky top-0 z-30 flex min-h-0 w-full flex-col border-b border-white/10 bg-[var(--dash-sidebar)] shadow-lg shadow-black/25 md:fixed md:inset-y-0 md:w-60 md:border-b-0 md:border-r md:border-white/10 md:shadow-xl lg:w-64">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2 md:h-auto md:flex-col md:items-stretch md:gap-3 md:px-4 md:py-5">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 md:flex-initial"
          >
            <span className="flex h-10 max-w-[9.5rem] shrink-0 items-center overflow-hidden rounded-xl bg-white/95 px-2 py-1 shadow-md shadow-black/15 ring-1 ring-black/10">
              <BrandLogo width={132} priority className="max-h-8 object-contain object-left" />
            </span>
            <span className="min-w-0 md:w-full">
              <span className="block font-brand text-lg font-bold leading-tight tracking-tight text-white">
                Vyria
              </span>
              <span className="block text-[11px] font-medium text-white/50">
                Painel Admin
              </span>
            </span>
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="absolute right-3 top-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10 active:bg-white/25 md:hidden"
          aria-label="Abrir menu"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="hidden min-h-0 flex-1 overflow-y-auto overscroll-y-contain md:block">
          <DashboardNavLinks pathname={pathname} plan={plan} layout="sidebar" />
        </div>

        <div className="mt-auto hidden shrink-0 space-y-2 border-t border-white/10 p-3 md:block">
          {vyriaDualAccount ? (
            <VyriaPanelModeSwitcher
              variant="dashboard"
              currentMode={vyriaDualAccount.mode}
            />
          ) : null}
          {storeSlug ? (
            <a
              href={`/${storeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white md:flex"
            >
              <IconExternal className="h-4 w-4 shrink-0" />
              Ver minha loja
            </a>
          ) : (
            <p className="hidden px-1 text-center text-[11px] text-white/40 md:block">
              Cria a tua loja para veres o link público
            </p>
          )}
          <PlansNavCta pathname={pathname} layout="sidebar" />
          {isAuthenticated ? <DashboardLogoutButton /> : null}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:min-h-dvh md:pl-60 lg:pl-64">
        {isAuthenticated ? <DashboardOrderRealtimeNotifier storeId={storeId} /> : null}
        {billingBanner && isAuthenticated ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5 md:px-6 lg:px-8 xl:px-10">
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:max-w-[1400px]">
              <p className="text-sm text-amber-950">
                Sua fatura de{' '}
                <span className="font-semibold">{billingBanner.openInvoiceDateLabel}</span> está em
                aberto. Regularize para manter o acesso.
              </p>
              <a
                href={billingBanner.payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-105"
              >
                Pagar agora
              </a>
            </div>
          </div>
        ) : null}
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--card-border)] bg-white/95 shadow-sm shadow-black/[0.03] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:gap-4 md:px-6 md:py-3.5 lg:px-8 xl:max-w-[1400px] xl:px-10">
            {isAuthenticated ? (
              <DashboardTopBar
                storeName={storeName}
                storeLogoUrl={storeLogoUrl}
                storeId={storeId}
                plan={plan}
                notificationCount={notificationCount}
              />
            ) : (
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium text-[#6b7280]">
                  Inicia sessão
                </span>
                <Link
                  href="/login"
                  className="rounded-full bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  Entrar
                </Link>
              </div>
            )}
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <main className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-5 sm:pt-5 md:px-6 md:pb-10 md:pt-6 lg:px-8 lg:pt-8 xl:max-w-[1400px] xl:px-10 xl:pb-12">
            <InstallAppBanner />
            {isAuthenticated ? <DashboardNotificationPrompt /> : null}
            {mainInner}
          </main>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 transition-colors active:bg-black/55"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-dvh min-h-0 w-[min(88vw,21rem)] flex-col border-l border-white/10 bg-[var(--dash-sidebar)] shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold text-white/85">Menu</p>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg border border-white/20 px-2 py-1 text-xs font-semibold text-white/85 transition-colors active:bg-white/15"
              >
                Fechar
              </button>
            </div>

            {vyriaDualAccount ? (
              <div className="border-b border-white/10 px-3 py-2">
                <VyriaPanelModeSwitcher
                  variant="dashboard"
                  currentMode={vyriaDualAccount.mode}
                />
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <DashboardNavLinks pathname={pathname} plan={plan} layout="drawer" />
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 p-3">
              <PlansNavCta pathname={pathname} layout="drawer" />
              {storeSlug ? (
                <a
                  href={`/${storeSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center justify-center gap-2 truncate rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 transition-colors active:bg-white/25"
                >
                  <IconExternal className="h-4 w-4 shrink-0" />
                  Ver minha loja
                </a>
              ) : (
                <span className="text-xs text-white/45">
                  Cria a tua loja para veres o link público
                </span>
              )}
              {isAuthenticated ? (
                <DashboardLogoutButton size="compact" className="w-full" />
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
