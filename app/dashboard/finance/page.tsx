import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconChartBars, IconCurrency } from '@/app/dashboard/_components/NavIcons'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { FinanceChartsClient } from '@/app/dashboard/finance/_components/FinanceChartsClient'
import { getFinanceCompareData, getFinancePageData } from '@/services/finance.server'
import { getStoreByUser } from '@/services/store.server'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function pctDelta(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current <= 0) return null
    return 'Novo'
  }
  const p = Math.round(((current - previous) / previous) * 100)
  if (p > 0) return `+${p}%`
  if (p < 0) return `${p}%`
  return '0%'
}

function FinanceKpiCard({
  label,
  value,
  trend,
  deltaSuffix,
  iconWrapClass,
  children,
}: {
  label: string
  value: string
  trend: string | null
  deltaSuffix: string
  iconWrapClass: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614] sm:text-[1.65rem]">
            {value}
          </p>
          {trend ? (
            <p className="mt-1 text-xs font-semibold text-[var(--dash-success)]">
              {trend}{' '}
              <span className="font-medium text-[#6b7280]">{deltaSuffix}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#9ca3af]">—</p>
          )}
        </div>
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
        >
          {children}
        </span>
      </div>
    </div>
  )
}

export default async function FinancePage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <Link
          href="/login"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Ir para login
        </Link>
      </div>
    )
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
        <Link
          href="/dashboard/settings"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const storeId = store.id as string
  const rawPlan =
    store && typeof store === 'object'
      ? readStorePlano(store as Record<string, unknown>)
      : undefined
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const financeComplete = hasFeature(plan, 'finance_complete')

  const d = await getFinancePageData(storeId)
  const compareData = financeComplete
    ? await getFinanceCompareData(storeId)
    : null

  const dayTrend = pctDelta(d.revenueToday, d.revenueYesterday)
  const monthTrend = pctDelta(d.monthRevenue, d.prevMonthRevenue)

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Financeiro</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
          Financeiro
        </h1>
        {!financeComplete && (
          <p className="mt-2 max-w-2xl text-sm text-[#6b7280]">
            No plano Start vês faturamento hoje e do mês. O{' '}
            <span className="font-semibold text-[#1a1614]">Financeiro completo</span>{' '}
            (comparativos, tendências e gráficos) está nos planos{' '}
            <span className="font-semibold">Growth</span> ou superior.
          </p>
        )}
      </header>

      {!financeComplete && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm">
          <p className="font-semibold">Queres comparativos e análise por período?</p>
          <p className="mt-1 text-amber-900/90">
            Faz upgrade para Growth para desbloquear gráficos e comparações no mesmo ecrã.
          </p>
          <Link
            href="/dashboard/upgrade?feature=finance_complete"
            className="mt-3 inline-flex rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Ver planos
          </Link>
        </div>
      )}

      <section
        className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2"
        aria-label="Indicadores financeiros"
      >
        <FinanceKpiCard
          label="Faturamento hoje"
          value={money.format(d.revenueToday)}
          trend={dayTrend}
          deltaSuffix="vs ontem"
          iconWrapClass="bg-[var(--dash-primary)]/15 text-[var(--dash-primary)]"
        >
          <IconCurrency className="h-6 w-6" />
        </FinanceKpiCard>

        <FinanceKpiCard
          label="Faturamento mês (calendário)"
          value={money.format(d.monthRevenue)}
          trend={monthTrend}
          deltaSuffix="vs mês anterior"
          iconWrapClass="bg-red-50 text-red-600"
        >
          <IconChartBars className="h-6 w-6" />
        </FinanceKpiCard>
      </section>

      {financeComplete && compareData ? (
        <FinanceChartsClient data={compareData} />
      ) : null}
    </div>
  )
}
